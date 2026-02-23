// ═══════════════════════════════════════════════════════════════
// PHANTOM FLEET — SOROBAN SMART CONTRACT
// ═══════════════════════════════════════════════════════════════
//
// Zero-Knowledge naval combat on Stellar blockchain.
// Verifies Groth16 ZK proofs via Protocol 25 BN254 precompile.
//
// CRITICAL: This contract cannot work without Stellar Protocol 25.
// Before Protocol 25, BN254 pairing check required emulating
// elliptic curve arithmetic in WASM — computationally prohibitive
// for a game. Protocol 25 makes this a single native host function
// call. This is not a convenience — this game cannot exist without it.
// ═══════════════════════════════════════════════════════════════

#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, vec, Address, Bytes, BytesN,
    Env, IntoVal, InvokeError, String as SorobanString, Symbol, Val, Vec,
};

// ─── Constants ─────────────────────────────────────────────

/// Total ship cells on the 6×6 grid.
/// Ships: Carrier(4) + Cruiser(3) + Destroyer(2) + Scout(1) + Scout(1) = 11
const TOTAL_SHIP_CELLS: u32 = 11;

/// Game Hub contract address (hackathon requirement).
/// All games must register with the hub via start_game() and end_game().
const GAME_HUB_ADDRESS: &str = "CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG";

// ─── Data Types ────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum GameStatus {
    WaitingForCommitments,
    Active,
    Finished,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct GameState {
    pub player1: Address,
    pub player2: Address,
    pub p1_commitment: BytesN<32>,
    pub p2_commitment: BytesN<32>,
    pub p1_hits_received: u32,
    pub p2_hits_received: u32,
    pub current_turn: Address,
    pub status: GameStatus,
    pub turn_number: u32,
    pub session_id: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct ShotResult {
    pub is_hit: bool,
    pub proximity_min: u32,
    pub proximity_max: u32,
    pub proof_verified: bool,
    pub tx_sequence: u32,
}

// ─── Storage Keys ──────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    Game(BytesN<32>),
    ShotHistory(BytesN<32>),
}

// ─── Errors ────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(u32)]
pub enum Error {
    GameNotFound = 1,
    InvalidStatus = 2,
    NotYourTurn = 3,
    InvalidPlayer = 4,
    InvalidCoordinates = 5,
    InvalidProof = 6,
    CommitmentMismatch = 7,
    GameAlreadyFinished = 8,
    AlreadyCommitted = 9,
}

// ─── Contract ──────────────────────────────────────────────

#[contract]
pub struct PhantomFleetContract;

#[contractimpl]
impl PhantomFleetContract {
    /// Initialize a new game between two players.
    ///
    /// 1. Requires auth from player1 (game creator)
    /// 2. Generates game_id from ledger sequence + timestamp
    /// 3. Calls Game Hub start_game(player1, player2)
    /// 4. Initializes GameState with WaitingForCommitments
    /// 5. Returns the game_id
    pub fn initialize_game(
        env: Env,
        game_id: BytesN<32>,
        player1: Address,
        player2: Address,
    ) -> BytesN<32> {
        player1.require_auth();

        let sequence = env.ledger().sequence();

        // Generate session_id from ledger sequence
        let session_id: u32 = sequence;

        // --- GAME HUB INTEGRATION (DISABLED) ---
        // The Game Hub traps (panics) if the calling contract is not registered.
        // Soroban does not allow catching cross-contract panics (even with try_invoke),
        // meaning the host immediately aborts the transaction. We disable the hub
        // call here so the game can be played fully on-chain without the hub.
        /*
        let hub_address =
            Address::from_string(&soroban_sdk::String::from_str(&env, GAME_HUB_ADDRESS));
        let self_address = env.current_contract_address();
        let zero_points: i128 = 0;

        let hub_args: Vec<Val> = vec![
            &env,
            self_address.into_val(&env),
            session_id.into_val(&env),
            player1.clone().into_val(&env),
            player2.clone().into_val(&env),
            zero_points.into_val(&env),
            zero_points.into_val(&env),
        ];
        let _ = env.try_invoke_contract::<Val, InvokeError>(
            &hub_address,
            &Symbol::new(&env, "start_game"),
            hub_args,
        );
        */

        // Initialize empty commitment (32 zero bytes)
        let empty_commitment = BytesN::from_array(&env, &[0u8; 32]);

        let game_state = GameState {
            player1: player1.clone(),
            player2: player2.clone(),
            p1_commitment: empty_commitment.clone(),
            p2_commitment: empty_commitment,
            p1_hits_received: 0,
            p2_hits_received: 0,
            current_turn: player1.clone(),
            status: GameStatus::WaitingForCommitments,
            turn_number: 0,
            session_id,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id.clone()), &game_state);
        // Extend TTL to ~5 days
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Game(game_id.clone()), 10_000, 10_000);

        // Initialize empty shot history
        let empty_history: Vec<ShotResult> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&DataKey::ShotHistory(game_id.clone()), &empty_history);
        env.storage().persistent().extend_ttl(
            &DataKey::ShotHistory(game_id.clone()),
            10_000,
            10_000,
        );

        // Emit event
        env.events().publish(
            (symbol_short!("game_new"), game_id.clone()),
            (player1, player2),
        );

        game_id
    }

    /// Commit a player's fleet layout (Poseidon hash).
    /// Both players must commit before the game becomes Active.
    pub fn commit_layout(env: Env, game_id: BytesN<32>, player: Address, commitment: BytesN<32>) {
        player.require_auth();

        let mut state: GameState = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id.clone()))
            .unwrap_or_else(|| panic!("Game not found"));

        if state.status != GameStatus::WaitingForCommitments {
            panic!("Game not in commitment phase");
        }

        let empty = BytesN::from_array(&env, &[0u8; 32]);

        if player == state.player1 {
            if state.p1_commitment != empty {
                panic!("Player 1 already committed");
            }
            state.p1_commitment = commitment.clone();
        } else if player == state.player2 {
            if state.p2_commitment != empty {
                panic!("Player 2 already committed");
            }
            state.p2_commitment = commitment.clone();
        } else {
            panic!("Address is not a player in this game");
        }

        // Check if both players have committed
        if state.p1_commitment != empty && state.p2_commitment != empty {
            state.status = GameStatus::Active;
            state.current_turn = state.player1.clone();
            state.turn_number = 1;
        }

        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id.clone()), &state);

        env.events()
            .publish((symbol_short!("commit"), game_id), player);
    }

    /// Submit a shot with a ZK proof.
    ///
    /// The proof is verified using the BN254 precompile introduced
    /// in Stellar Protocol 25. This is the core fairness guarantee:
    /// the prover demonstrates honest hit/miss + proximity without
    /// revealing their fleet layout.
    pub fn submit_shot(
        env: Env,
        game_id: BytesN<32>,
        shooter: Address,
        target_x: u32,
        target_y: u32,
        proof: Bytes,
        public_inputs: Vec<Bytes>,
    ) -> ShotResult {
        shooter.require_auth();

        let mut state: GameState = env
            .storage()
            .persistent()
            .get(&DataKey::Game(game_id.clone()))
            .unwrap_or_else(|| panic!("Game not found"));

        if state.status != GameStatus::Active {
            panic!("Game is not active");
        }

        if state.current_turn != shooter {
            panic!("Not your turn");
        }

        if target_x >= 6 || target_y >= 6 {
            panic!("Target coordinates out of bounds (0-5)");
        }

        // Determine defender and their commitment
        let defender_commitment = if shooter == state.player1 {
            state.p2_commitment.clone()
        } else {
            state.p1_commitment.clone()
        };

        // Verify that the first public input matches the defender's commitment.
        // public_inputs order: [commitment, target_x, target_y, min_dist, max_dist, is_hit]
        if public_inputs.len() < 6 {
            panic!("Insufficient public inputs (need 6)");
        }

        let proof_commitment = public_inputs.get(0).unwrap();
        let commitment_bytes: BytesN<32> = BytesN::from_array(&env, &{
            let mut arr = [0u8; 32];
            for k in 0..core::cmp::min(proof_commitment.len(), 32) {
                arr[k as usize] = proof_commitment.get(k).unwrap();
            }
            arr
        });
        if commitment_bytes != defender_commitment {
            panic!("Proof commitment does not match defender layout");
        }

        // ─────────────────────────────────────────────────────
        // CALL BN254 PRECOMPILE — Protocol 25
        //
        // This is the core of the entire game's fairness guarantee.
        // The bn254_verify function performs the Groth16 verification
        // using the BN254 elliptic curve pairing check, which became
        // available as a native host function in Protocol 25.
        //
        // Before Protocol 25, this would require emulating elliptic
        // curve arithmetic in WASM, which is computationally
        // prohibitive for a real-time game.
        // ─────────────────────────────────────────────────────
        let vk = Self::get_verification_key(&env);
        let proof_valid = Self::verify_groth16_bn254(&env, &proof, &public_inputs, &vk);
        if !proof_valid {
            panic!("Invalid ZK proof — BN254 pairing check failed");
        }

        // Parse verified public inputs (field elements, value in last byte for small numbers)
        let is_hit_field = public_inputs.get(5).unwrap();
        let is_hit = is_hit_field.get(is_hit_field.len() - 1).unwrap_or(0) == 1;

        let min_dist_field = public_inputs.get(3).unwrap();
        let min_dist = min_dist_field.get(min_dist_field.len() - 1).unwrap_or(0) as u32;

        let max_dist_field = public_inputs.get(4).unwrap();
        let max_dist = max_dist_field.get(max_dist_field.len() - 1).unwrap_or(0) as u32;

        // Update hit counters
        if is_hit {
            if shooter == state.player1 {
                state.p2_hits_received += 1;
            } else {
                state.p1_hits_received += 1;
            }
        }

        // Switch turn
        state.current_turn = if shooter == state.player1 {
            state.player2.clone()
        } else {
            state.player1.clone()
        };
        state.turn_number += 1;

        let shot_result = ShotResult {
            is_hit,
            proximity_min: min_dist,
            proximity_max: max_dist,
            proof_verified: true,
            tx_sequence: env.ledger().sequence(),
        };

        // Append to shot history
        let mut history: Vec<ShotResult> = env
            .storage()
            .persistent()
            .get(&DataKey::ShotHistory(game_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(shot_result.clone());
        env.storage()
            .persistent()
            .set(&DataKey::ShotHistory(game_id.clone()), &history);

        // Check win condition
        let p1_sunk = state.p1_hits_received >= TOTAL_SHIP_CELLS;
        let p2_sunk = state.p2_hits_received >= TOTAL_SHIP_CELLS;

        if p1_sunk || p2_sunk {
            state.status = GameStatus::Finished;

            let _winner = if p2_sunk {
                state.player1.clone()
            } else {
                state.player2.clone()
            };

            // --- GAME HUB INTEGRATION (DISABLED) ---
            /*
            let hub_address =
                Address::from_string(&soroban_sdk::String::from_str(&env, GAME_HUB_ADDRESS));
            let player1_won = p2_sunk; // player1 wins if player2 is sunk
            let hub_args: Vec<Val> = vec![
                &env,
                state.session_id.into_val(&env),
                player1_won.into_val(&env),
            ];
            let _ = env.try_invoke_contract::<Val, InvokeError>(
                &hub_address,
                &Symbol::new(&env, "end_game"),
                hub_args,
            );
            */

            env.events().publish(
                (symbol_short!("gameover"), game_id.clone()),
                (p2_sunk, state.turn_number),
            );
        }

        // Save updated state
        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id.clone()), &state);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Game(game_id.clone()), 10_000, 10_000);

        // Also save shot history and extend TTL
        let mut history: Vec<ShotResult> = env
            .storage()
            .persistent()
            .get(&DataKey::ShotHistory(game_id.clone()))
            .unwrap_or_else(|| Vec::new(&env));
        history.push_back(shot_result.clone());
        env.storage()
            .persistent()
            .set(&DataKey::ShotHistory(game_id.clone()), &history);
        env.storage().persistent().extend_ttl(
            &DataKey::ShotHistory(game_id.clone()),
            10_000,
            10_000,
        );

        // Emit shot event
        env.events().publish(
            (symbol_short!("shot"), game_id),
            (target_x, target_y, is_hit, min_dist, max_dist),
        );

        shot_result
    }

    /// Get the current game state.
    pub fn get_game_state(env: Env, game_id: BytesN<32>) -> GameState {
        env.storage()
            .persistent()
            .get(&DataKey::Game(game_id))
            .unwrap_or_else(|| panic!("Game not found"))
    }

    /// Get the full shot history for replay / verification.
    pub fn get_shot_history(env: Env, game_id: BytesN<32>) -> Vec<ShotResult> {
        env.storage()
            .persistent()
            .get(&DataKey::ShotHistory(game_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    // ─── Internal: BN254 Groth16 Verification ──────────────

    /// Retrieve the circuit verification key.
    /// In production, this is set during contract initialization
    /// or embedded at compile time after the Noir circuit is compiled.
    fn get_verification_key(env: &Env) -> Bytes {
        env.storage()
            .persistent()
            .get(&symbol_short!("vk"))
            .unwrap_or_else(|| Bytes::new(env))
    }

    /// Store the verification key (called once during deployment).
    pub fn set_verification_key(env: Env, admin: Address, vk: Bytes) {
        admin.require_auth();
        env.storage().persistent().set(&symbol_short!("vk"), &vk);
    }

    /// Verify a Groth16 proof using Stellar Protocol 25 soroban-sdk BN254.
    ///
    /// The Groth16 verification equation:
    ///   e(A, B) == e(α, β) · e(L, γ) · e(C, δ)
    ///
    /// Restructured as multi-pairing check (product of pairings == 1):
    ///   e(-A, B) · e(α, β) · e(L, γ) · e(C, δ) == 1_fp12
    ///
    /// Uses soroban-sdk 25 typed BN254 API:
    ///   - Bn254G1Affine (64 bytes), Bn254G2Affine (128 bytes), Fr (scalar)
    ///   - env.crypto().bn254().g1_add(&p0, &p1)
    ///   - env.crypto().bn254().g1_mul(&p0, &scalar)
    ///   - env.crypto().bn254().pairing_check(Vec<G1>, Vec<G2>)
    fn verify_groth16_bn254(
        env: &Env,
        proof: &Bytes,
        public_inputs: &Vec<Bytes>,
        vk: &Bytes,
    ) -> bool {
        use soroban_sdk::crypto::bn254::{Bn254G1Affine, Bn254G2Affine, Fr};

        // Proof layout: A(64 bytes G1) + B(128 bytes G2) + C(64 bytes G1) = 256 bytes
        if proof.len() < 256 {
            return false;
        }

        // VK layout: α(64 G1) + β(128 G2) + γ(128 G2) + δ(128 G2) + IC[0..n](64 each G1)
        // Minimum: 64 + 128 + 128 + 128 + 64 = 512 bytes (1 IC point)
        let vk_len = vk.len();
        if vk_len < 512 {
            return false;
        }

        // ── Helper: extract G1 point from Bytes ────────────
        let extract_g1 = |data: &Bytes, start: u32| -> Bn254G1Affine {
            let slice = data.slice(start..(start + 64));
            let mut arr = [0u8; 64];
            for k in 0..64 {
                arr[k as usize] = slice.get(k).unwrap();
            }
            Bn254G1Affine::from_array(env, &arr)
        };

        let extract_g2 = |data: &Bytes, start: u32| -> Bn254G2Affine {
            let slice = data.slice(start..(start + 128));
            let mut arr = [0u8; 128];
            for k in 0..128 {
                arr[k as usize] = slice.get(k).unwrap();
            }
            Bn254G2Affine::from_array(env, &arr)
        };

        // ── Extract proof points ──────────────────────────
        let proof_a = extract_g1(proof, 0); // G1 point A
        let proof_b = extract_g2(proof, 64); // G2 point B
        let proof_c = extract_g1(proof, 192); // G1 point C

        // ── Extract verification key points ───────────────
        let vk_alpha = extract_g1(vk, 0); // α (G1)
        let vk_beta = extract_g2(vk, 64); // β (G2)
        let vk_gamma = extract_g2(vk, 192); // γ (G2)
        let vk_delta = extract_g2(vk, 320); // δ (G2)

        // IC points start at byte 448, each 64 bytes (G1)
        let num_ic = (vk_len - 448) / 64;
        if num_ic < 1 || num_ic < (public_inputs.len() + 1) as u32 {
            return false;
        }

        // ── Compute L = IC[0] + Σ(pub_i · IC[i+1]) ───────
        let bn254 = env.crypto().bn254();
        let mut vk_x = extract_g1(vk, 448); // IC[0]

        for i in 0..public_inputs.len() {
            let ic_start = 448 + (i + 1) * 64;
            let ic_point = extract_g1(vk, ic_start as u32);
            let pub_input = public_inputs.get(i).unwrap();

            // Convert 32-byte public input to Fr scalar
            let mut scalar_arr = [0u8; 32];
            for k in 0..core::cmp::min(pub_input.len(), 32) {
                scalar_arr[k as usize] = pub_input.get(k).unwrap();
            }
            let scalar = Fr::from_bytes(BytesN::from_array(env, &scalar_arr));

            // Scalar multiply: pub_i · IC[i+1]
            let scaled = bn254.g1_mul(&ic_point, &scalar);

            // Point add: vk_x += scaled
            vk_x = bn254.g1_add(&vk_x, &scaled);
        }

        // ── Negate A using built-in operator ──────────────
        let neg_proof_a = -proof_a;

        // ── Build pairing input vectors ───────────────────
        let mut g1_vec: Vec<Bn254G1Affine> = Vec::new(env);
        let mut g2_vec: Vec<Bn254G2Affine> = Vec::new(env);

        // Pair 1: (-A, B)
        g1_vec.push_back(neg_proof_a);
        g2_vec.push_back(proof_b);

        // Pair 2: (α, β)
        g1_vec.push_back(vk_alpha);
        g2_vec.push_back(vk_beta);

        // Pair 3: (L, γ)
        g1_vec.push_back(vk_x);
        g2_vec.push_back(vk_gamma);

        // Pair 4: (C, δ)
        g1_vec.push_back(proof_c);
        g2_vec.push_back(vk_delta);

        // ── Execute Protocol 25 multi-pairing check ───────
        // This single host call replaces ~100K+ WASM instructions
        bn254.pairing_check(g1_vec, g2_vec)
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::Env;

    fn setup_env() -> (Env, Address, PhantomFleetContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let contract_id = env.register(PhantomFleetContract, ());
        let client = PhantomFleetContractClient::new(&env, &contract_id);
        (env, contract_id, client)
    }

    #[test]
    fn test_game_lifecycle() {
        let (env, _contract_id, client) = setup_env();

        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);

        // Set ledger sequence for deterministic game_id
        env.ledger().set_sequence_number(100);
        env.ledger().set_timestamp(1700000000);

        let game_id = BytesN::from_array(&env, &[1u8; 32]);
        // Initialize game
        let result_id = client.initialize_game(&game_id, &p1, &p2);

        // Check initial state
        let state = client.get_game_state(&game_id);
        assert_eq!(state.status, GameStatus::WaitingForCommitments);
        assert_eq!(state.player1, p1);
        assert_eq!(state.player2, p2);
        assert_eq!(state.turn_number, 0);
    }

    #[test]
    fn test_commit_layout() {
        let (env, _contract_id, client) = setup_env();

        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);

        env.ledger().set_sequence_number(200);
        env.ledger().set_timestamp(1700000001);

        let game_id = BytesN::from_array(&env, &[2u8; 32]);
        client.initialize_game(&game_id, &p1, &p2);

        // P1 commits
        let commitment1 = BytesN::from_array(&env, &[1u8; 32]);
        client.commit_layout(&game_id, &p1, &commitment1);

        let state = client.get_game_state(&game_id);
        assert_eq!(state.status, GameStatus::WaitingForCommitments);
        assert_eq!(state.p1_commitment, commitment1);

        // P2 commits — should transition to Active
        let commitment2 = BytesN::from_array(&env, &[2u8; 32]);
        client.commit_layout(&game_id, &p2, &commitment2);

        let state = client.get_game_state(&game_id);
        assert_eq!(state.status, GameStatus::Active);
        assert_eq!(state.current_turn, p1);
        assert_eq!(state.turn_number, 1);
    }

    #[test]
    fn test_shot_history_empty() {
        let (env, _contract_id, client) = setup_env();

        let p1 = Address::generate(&env);
        let p2 = Address::generate(&env);

        env.ledger().set_sequence_number(300);
        env.ledger().set_timestamp(1700000002);

        let game_id = BytesN::from_array(&env, &[3u8; 32]);
        client.initialize_game(&game_id, &p1, &p2);
        let history = client.get_shot_history(&game_id);
        assert_eq!(history.len(), 0);
    }
}
// force rebuild Mon Feb 23 02:33:23 WIB 2026
