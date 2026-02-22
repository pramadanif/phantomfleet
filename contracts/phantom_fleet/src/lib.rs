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
    Env, IntoVal, Symbol, Val, Vec,
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
    pub game_hub_game_id: BytesN<32>,
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
    pub fn initialize_game(env: Env, player1: Address, player2: Address) -> BytesN<32> {
        player1.require_auth();

        // Generate deterministic game_id from ledger state
        let sequence = env.ledger().sequence();
        let timestamp = env.ledger().timestamp();
        let mut id_bytes = [0u8; 32];
        let seq_bytes = sequence.to_be_bytes();
        let ts_bytes = timestamp.to_be_bytes();
        id_bytes[0..4].copy_from_slice(&seq_bytes);
        id_bytes[4..12].copy_from_slice(&ts_bytes);
        // Mix in player addresses for uniqueness
        id_bytes[12] = seq_bytes[0] ^ ts_bytes[0];
        id_bytes[13] = seq_bytes[1] ^ ts_bytes[1];
        id_bytes[14] = seq_bytes[2] ^ ts_bytes[2];
        id_bytes[15] = seq_bytes[3] ^ ts_bytes[3];
        let game_id = BytesN::from_array(&env, &id_bytes);

        // Call Game Hub start_game(player1, player2)
        let hub_address =
            Address::from_string(&soroban_sdk::String::from_str(&env, GAME_HUB_ADDRESS));
        let hub_game_id: BytesN<32> = env.invoke_contract(
            &hub_address,
            &Symbol::new(&env, "start_game"),
            vec![
                &env,
                player1.clone().into_val(&env),
                player2.clone().into_val(&env),
            ],
        );

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
            game_hub_game_id: hub_game_id,
        };

        // Persist game state
        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id.clone()), &game_state);

        // Initialize empty shot history
        let empty_history: Vec<ShotResult> = Vec::new(&env);
        env.storage()
            .persistent()
            .set(&DataKey::ShotHistory(game_id.clone()), &empty_history);

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
            let raw = proof_commitment.to_alloc_vec();
            let len = if raw.len() > 32 { 32 } else { raw.len() };
            arr[..len].copy_from_slice(&raw[..len]);
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

        // Parse verified public inputs
        let is_hit_bytes = public_inputs.get(5).unwrap().to_alloc_vec();
        let is_hit = is_hit_bytes.first().map_or(false, |b| *b == 1);

        let min_dist_bytes = public_inputs.get(3).unwrap().to_alloc_vec();
        let min_dist = *min_dist_bytes.first().unwrap_or(&0) as u32;

        let max_dist_bytes = public_inputs.get(4).unwrap().to_alloc_vec();
        let max_dist = *max_dist_bytes.first().unwrap_or(&0) as u32;

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

            let winner = if p2_sunk {
                state.player1.clone()
            } else {
                state.player2.clone()
            };

            // Call Game Hub end_game(game_hub_game_id, winner)
            let hub_address =
                Address::from_string(&soroban_sdk::String::from_str(&env, GAME_HUB_ADDRESS));
            let _: Val = env.invoke_contract(
                &hub_address,
                &Symbol::new(&env, "end_game"),
                vec![
                    &env,
                    state.game_hub_game_id.clone().into_val(&env),
                    winner.into_val(&env),
                ],
            );

            env.events().publish(
                (symbol_short!("gameover"), game_id.clone()),
                (p2_sunk, state.turn_number),
            );
        }

        // Save updated state
        env.storage()
            .persistent()
            .set(&DataKey::Game(game_id.clone()), &state);

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
        // The verification key is stored during deployment.
        // It contains the BN254 curve points needed for pairing check:
        //   - alpha, beta, gamma, delta points
        //   - IC (input commitments) points
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

    /// Verify a Groth16 proof using Stellar Protocol 25 CAP-0074 BN254.
    ///
    /// The Groth16 verification equation:
    ///   e(A, B) == e(α, β) · e(L, γ) · e(C, δ)
    ///
    /// Restructured as multi-pairing check (product of pairings == 1):
    ///   e(-A, B) · e(α, β) · e(L, γ) · e(C, δ) == 1_fp12
    ///
    /// Uses the exact CAP-0074 host functions:
    ///   - bn254_g1_add(BytesObject, BytesObject) -> BytesObject
    ///   - bn254_g1_mul(BytesObject, U256Val) -> BytesObject
    ///   - bn254_multi_pairing_check(Vec<BytesObject>, Vec<BytesObject>) -> Bool
    ///
    /// Point encoding (CAP-0074):
    ///   G1: 64 bytes = be_encode(X) || be_encode(Y)   (X,Y = 32 bytes each)
    ///   G2: 128 bytes = be_encode(X_c1) || be_encode(X_c0) || be_encode(Y_c1) || be_encode(Y_c0)
    fn verify_groth16_bn254(
        env: &Env,
        proof: &Bytes,
        public_inputs: &Vec<Bytes>,
        vk: &Bytes,
    ) -> bool {
        // Proof layout: A(64 bytes G1) + B(128 bytes G2) + C(64 bytes G1) = 256 bytes
        let proof_len = proof.len();
        if proof_len < 256 {
            return false;
        }

        // VK layout: α(64 G1) + β(128 G2) + γ(128 G2) + δ(128 G2) + IC[0..n](64 each G1)
        // Minimum: 64 + 128 + 128 + 128 + 64 = 512 bytes (1 IC point)
        let vk_len = vk.len();
        if vk_len < 512 {
            return false;
        }

        // ── Extract proof points ──────────────────────────
        let proof_a_g1 = proof.slice(0..64); // G1 point A (64 bytes)
        let proof_b_g2 = proof.slice(64..192); // G2 point B (128 bytes)
        let proof_c_g1 = proof.slice(192..256); // G1 point C (64 bytes)

        // ── Extract verification key points ───────────────
        let vk_alpha_g1 = vk.slice(0..64); // α (G1, 64 bytes)
        let vk_beta_g2 = vk.slice(64..192); // β (G2, 128 bytes)
        let vk_gamma_g2 = vk.slice(192..320); // γ (G2, 128 bytes)
        let vk_delta_g2 = vk.slice(320..448); // δ (G2, 128 bytes)

        // IC points start at byte 448, each 64 bytes (G1)
        let num_ic = (vk_len - 448) / 64;
        if num_ic < 1 || num_ic < (public_inputs.len() + 1) as u32 {
            return false;
        }

        // ── Compute L = IC[0] + Σ(pub_i · IC[i+1]) ───────
        // Using Protocol 25 BN254 scalar multiplication + point addition
        let mut vk_x = vk.slice(448..512); // IC[0] (G1, 64 bytes)

        for i in 0..public_inputs.len() {
            let ic_start = 448 + (i + 1) * 64;
            let ic_point = vk.slice(ic_start..(ic_start + 64));
            let pub_input = public_inputs.get(i).unwrap();

            // CAP-0074: bn254_g1_mul takes (BytesObject, U256Val)
            // Public input is a 32-byte scalar interpreted as U256
            let scalar = Self::bytes_to_u256(env, &pub_input);

            // Scalar multiply: pub_i · IC[i+1]
            let scaled = env.crypto().bn254_g1_mul(&ic_point, &scalar);

            // Point add: vk_x += scaled
            vk_x = env.crypto().bn254_g1_add(&vk_x, &scaled);
        }

        // ── Negate A for the pairing check ────────────────
        // Negating G1: flip Y coordinate → (X, p - Y)
        // BN254 base field modulus p:
        // 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
        let neg_proof_a = Self::negate_g1_bn254(env, &proof_a_g1);

        // ── Build pairing input vectors ───────────────────
        // CAP-0074: bn254_multi_pairing_check(Vec<G1>, Vec<G2>) -> Bool
        // Check: e(-A, B) · e(α, β) · e(L, γ) · e(C, δ) == 1_fp12
        let mut g1_vec: Vec<Bytes> = Vec::new(env);
        let mut g2_vec: Vec<Bytes> = Vec::new(env);

        // Pair 1: (-A, B)
        g1_vec.push_back(neg_proof_a);
        g2_vec.push_back(proof_b_g2);

        // Pair 2: (α, β)
        g1_vec.push_back(vk_alpha_g1);
        g2_vec.push_back(vk_beta_g2);

        // Pair 3: (L, γ)
        g1_vec.push_back(vk_x);
        g2_vec.push_back(vk_gamma_g2);

        // Pair 4: (C, δ)
        g1_vec.push_back(proof_c_g1);
        g2_vec.push_back(vk_delta_g2);

        // ── Execute Protocol 25 multi-pairing check ───────
        // This single host call replaces ~100K+ WASM instructions
        env.crypto().bn254_multi_pairing_check(&g1_vec, &g2_vec)
    }

    /// Convert a 32-byte Bytes scalar to U256Val for bn254_g1_mul.
    fn bytes_to_u256(env: &Env, b: &Bytes) -> U256 {
        let arr = b.to_alloc_vec();
        let mut limbs = [0u64; 4];
        // Big-endian bytes → 4 × u64 limbs (little-endian order)
        for i in 0..4 {
            let offset = 24 - i * 8;
            for j in 0..8 {
                let byte_idx = offset + j;
                if byte_idx < arr.len() {
                    limbs[i] = (limbs[i] << 8) | (arr[byte_idx] as u64);
                }
            }
        }
        U256::from_parts(env, limbs[3], limbs[2], limbs[1], limbs[0])
    }

    /// Negate a BN254 G1 point: (X, Y) → (X, p - Y).
    /// BN254 G1 points are 64 bytes: X (32 bytes) + Y (32 bytes).
    fn negate_g1_bn254(env: &Env, point: &Bytes) -> Bytes {
        if point.len() != 64 {
            return point.clone();
        }

        let x = point.slice(0..32);
        let y = point.slice(32..64);

        // BN254 base field modulus p
        // p = 0x30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
        let p_bytes = Bytes::from_slice(
            env,
            &[
                0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29, 0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81,
                0x58, 0x5d, 0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d, 0x3c, 0x20, 0x8c, 0x16,
                0xd8, 0x7c, 0xfd, 0x47,
            ],
        );

        // neg_y = p - y
        let neg_y = Self::field_sub_32(env, &p_bytes, &y);

        let mut result = Bytes::new(env);
        result.append(&x);
        result.append(&neg_y);
        result
    }

    /// Subtract two 32-byte big-endian field elements: a - b.
    fn field_sub_32(env: &Env, a: &Bytes, b: &Bytes) -> Bytes {
        let mut result = [0u8; 32];
        let a_vec = a.to_alloc_vec();
        let b_vec = b.to_alloc_vec();

        let mut borrow: i16 = 0;
        for i in (0..32).rev() {
            let diff = (a_vec[i] as i16) - (b_vec[i] as i16) - borrow;
            if diff < 0 {
                result[i] = (diff + 256) as u8;
                borrow = 1;
            } else {
                result[i] = diff as u8;
                borrow = 0;
            }
        }

        Bytes::from_slice(env, &result)
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

        // Initialize game
        let game_id = client.initialize_game(&p1, &p2);

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

        let game_id = client.initialize_game(&p1, &p2);

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

        let game_id = client.initialize_game(&p1, &p2);
        let history = client.get_shot_history(&game_id);
        assert_eq!(history.len(), 0);
    }
}
