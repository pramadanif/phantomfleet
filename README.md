# Phantom Fleet

> A zero-knowledge naval combat game where your fleet is cryptographically invisible — and every shot proves its honesty on-chain.

## Play Now

🎮 **[Play on Testnet →](https://phantomfleet.xyz/game)** (requires [Freighter wallet](https://freighter.app) configured for Stellar Testnet)

> ⚠️ This game runs on **Stellar Testnet** — no real XLM is used. Fund your wallet at [friendbot.stellar.org](https://friendbot.stellar.org).

## What Makes This Different

Traditional online Battleship has a fundamental trust problem: a central server knows both players' ship layouts, creating opportunities for cheating, data leaks, and manipulation. Phantom Fleet eliminates the server entirely. Each player's fleet layout is committed as a **Poseidon hash** on the Stellar blockchain *before the game begins*. No entity — not the opponent, not the contract, not even the game creators — can see where your ships are placed.

The breakthrough mechanic is the **proximity range proof**. In standard Battleship, a miss reveals nothing. In Phantom Fleet, every miss is accompanied by a cryptographic proof revealing *how close* the shot was to the nearest ship — within a Chebyshev distance range like "1-2 cells" or "3-4 cells" — without revealing which ship or in which direction. This proof is generated entirely client-side using a **Noir ZK circuit** and verified on-chain via Stellar's **Protocol 25 BN254 precompile**. The result is a game with richer strategy and zero trust assumptions.

## ZK Architecture

### Circuit (For Cryptographers)

The Noir circuit (`circuits/phantom_fleet/src/main.nr`) enforces four constraint groups in ~850 total constraints:

| Constraint | Purpose | Cost |
|---|---|---|
| **1. Commitment** | `Poseidon(grid_hash, nonce) == on-chain commitment` | ~200 |
| **2. Bounds** | `target_x < 6 && target_y < 6` | ~10 |
| **3. Honesty** | `grid[target_y * 6 + target_x] == is_hit` | ~40 |
| **4. Proximity** | Chebyshev distance in range + no closer ship exists | ~600 |

**Why Chebyshev?** Euclidean distance requires a square root circuit (~200 extra constraints). Chebyshev (`max(|dx|, |dy|)`) maps directly to grid rings and saves significant proof time.

**Why iterate all 36 cells?** Constraint 4d verifies *no ship exists closer* than the claimed nearest. Without this, a prover could dishonestly claim a distant ship as closest. The ~300 constraint cost is the price of soundness.

**Proof profile:** Groth16 on BN254. 256 bytes. Target generation time: <10 seconds in browser WASM via Barretenberg backend.

### On-Chain Verification

The Soroban contract calls Stellar's **native BN254 host functions** ([CAP-0074](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md), Protocol 25) to verify each Groth16 proof:

- `bn254_g1_mul` — scalar multiplication for public input linear combination
- `bn254_g1_add` — point addition for accumulating IC points  
- `bn254_multi_pairing_check` — the 4-pair Groth16 equation check

This confirms the Groth16 equation `e(A, B) = e(α, β) · e(L, γ) · e(C, δ)` holds — guaranteeing the prover's claims about hit/miss and proximity are mathematically honest.

## Why Stellar Protocol 25 Makes This Possible

Before Protocol 25, verifying a BN254 Groth16 proof on Stellar would require emulating elliptic curve pairing arithmetic in WASM. A single pairing check involves hundreds of field multiplications, point additions, and a final exponentiation over a 254-bit prime field. In WASM, this takes **minutes** and consumes prohibitive amounts of gas — making real-time game turns impossible.

Protocol 25 ([CAP-0074](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0074.md)) introduces **native BN254 host functions** that execute elliptic curve operations in microseconds at minimal cost. Protocol 25 also adds **native Poseidon hash primitives** ([CAP-0075](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0075.md)) that allow efficient ZK-friendly hashing both on-chain and off-chain.

**This game cannot exist on Stellar without Protocol 25.** It is not an optimization — it is the enabling technology.

## Contract Addresses

| Contract | Address | Explorer |
|---|---|---|
| Phantom Fleet | *Deployed via `scripts/deploy.sh`* | [View](https://stellar.expert/explorer/testnet/contract/) |
| Game Hub | `CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG` | [View](https://stellar.expert/explorer/testnet/contract/CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG) |

## Running Locally

### Prerequisites

```bash
# Install Noir (ZK circuit compiler)
curl -L noirup.dev | bash && noirup

# Install Stellar CLI (Soroban deployment)
cargo install --locked stellar-cli

# Install Rust WASM target
rustup target add wasm32-unknown-unknown

# Generate and fund a testnet keypair
stellar keys generate --network testnet phantom-fleet
curl "https://friendbot.stellar.org?addr=$(stellar keys address phantom-fleet)"
export STELLAR_SECRET_KEY=$(stellar keys show phantom-fleet)
```

### Deploy

```bash
# Deploy circuit + contract to Stellar Testnet
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

### Start Frontend

```bash
npm install
npm run dev
# Open http://localhost:3000/game
```

### Run Integration Test

```bash
npx ts-node scripts/test-integration.ts
```

## How to Play

1. **Connect** your Freighter wallet (set to Stellar Testnet) and create or join a game.
2. **Place** your 5 ships on the 6×6 grid. Your layout is cryptographically sealed — your opponent will never see it.
3. **Fire** shots at your opponent's grid. Each shot generates a zero-knowledge proof that verifies the result without revealing any fleet positions. Misses include a proximity ring showing how close you were.

The first player to sink all 11 enemy ship cells wins. Every move is permanently recorded on Stellar.

## Technical Stack

| Layer | Technology |
|---|---|
| ZK Circuit | [Noir](https://noir-lang.org) — Aztec's domain-specific language for ZK proofs |
| Proving System | Groth16 on BN254 via [Barretenberg](https://github.com/AztecProtocol/barretenberg) |
| Hash Function | Poseidon (BN254-native, circuit-friendly) |
| Smart Contract | [Soroban](https://soroban.stellar.org) (Rust → WASM) |
| On-Chain Verification | Stellar Protocol 25 BN254 precompile |
| Blockchain | [Stellar](https://stellar.org) Testnet |
| Frontend | Next.js 16, React 19, Framer Motion |
| Wallet | [Freighter](https://freighter.app) browser extension |
| Design | Custom military-grade aesthetic — no border-radius, crosshair cursor, brass/abyss palette |

## Hackathon Submission Compliance

| Requirement | Status | Details |
|---|---|---|
| ✅ ZK-Powered Mechanic | **Core** | Every shot generates a real ZK proof (Noir/Barretenberg) proving hit/miss + proximity range without revealing fleet positions |
| ✅ Deployed Onchain | **Testnet** | Contract calls `start_game()` and `end_game()` on Game Hub `CB4VZAT…EMYG` via cross-contract invocation |
| ✅ Front End | **Functional** | 5-screen React game with ship placement, real-time battle, bot opponent, and game over |
| ✅ Open-source Repo | **Public** | Full source code with this README.md |
| ⬜ Video Demo | **Pending** | 2-3 minute demonstration of gameplay + ZK explanation |
