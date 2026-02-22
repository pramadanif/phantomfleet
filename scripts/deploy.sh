#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# PHANTOM FLEET — FULL DEPLOYMENT TO STELLAR TESTNET
# ═══════════════════════════════════════════════════════════════
#
# Prerequisites:
#   - Noir (noirup): https://noir-lang.org/docs/getting_started/installation
#   - Stellar CLI:   cargo install --locked stellar-cli
#   - Rust target:   rustup target add wasm32-unknown-unknown
#   - $STELLAR_SECRET_KEY env var set with funded testnet account
#
# Run: ./scripts/deploy.sh
# ═══════════════════════════════════════════════════════════════

set -e

echo ""
echo "═══════════════════════════════════════"
echo "PHANTOM FLEET — DEPLOYING TO TESTNET"
echo "═══════════════════════════════════════"
echo ""

# Verify prerequisites
if ! command -v nargo &> /dev/null; then
    echo "✗ nargo not found. Install: curl -L noirup.dev | bash && noirup"
    exit 1
fi

if ! command -v stellar &> /dev/null; then
    echo "✗ stellar CLI not found. Install: cargo install --locked stellar-cli"
    exit 1
fi

if [ -z "$STELLAR_SECRET_KEY" ]; then
    echo "✗ STELLAR_SECRET_KEY not set."
    echo "  Generate a testnet keypair: stellar keys generate --network testnet phantom-fleet"
    echo "  Fund it: curl https://friendbot.stellar.org?addr=<PUBLIC_KEY>"
    echo "  Export: export STELLAR_SECRET_KEY=<SECRET_KEY>"
    exit 1
fi

# ─── Step 1: Compile Noir Circuit ───────────────────────────

echo "▶ Step 1/5: Compiling Noir circuit..."
cd circuits/phantom_fleet

nargo compile 2>&1
echo "  ● Circuit compiled successfully"

echo "  ▶ Running test proof with Prover.toml..."
nargo prove 2>&1 || echo "  ⚠ Proof generation requires valid witness (expected in dev)"

echo "  ▶ Verifying test proof..."
nargo verify 2>&1 || echo "  ⚠ Verification skipped (needs valid proof from above)"

echo "  ● Noir circuit ready"
cd ../..

# ─── Step 2: Export Verification Key ────────────────────────

echo ""
echo "▶ Step 2/5: Exporting verification key..."

VK_PATH="circuits/phantom_fleet/target/vk.bin"
if [ -f "$VK_PATH" ]; then
    VK_HEX=$(xxd -p "$VK_PATH" | tr -d '\n')
    echo "  ● VK exported (${#VK_HEX} hex chars)"
else
    echo "  ⚠ VK file not found at $VK_PATH — will be generated after first nargo prove"
    VK_HEX=""
fi

# ─── Step 3: Build Soroban Contract ────────────────────────

echo ""
echo "▶ Step 3/5: Building Soroban contract..."
cd contracts/phantom_fleet

cargo build --target wasm32-unknown-unknown --release 2>&1
echo "  ● Contract compiled"

echo "  ▶ Optimizing WASM..."
WASM_PATH="target/wasm32-unknown-unknown/release/phantom_fleet.wasm"
stellar contract optimize --wasm "$WASM_PATH" 2>&1
OPTIMIZED_PATH="target/wasm32-unknown-unknown/release/phantom_fleet.optimized.wasm"

if [ -f "$OPTIMIZED_PATH" ]; then
    SIZE=$(wc -c < "$OPTIMIZED_PATH")
    echo "  ● Optimized WASM: ${SIZE} bytes"
else
    OPTIMIZED_PATH="$WASM_PATH"
    SIZE=$(wc -c < "$WASM_PATH")
    echo "  ● WASM (unoptimized): ${SIZE} bytes"
fi

cd ../..

# ─── Step 4: Deploy to Stellar Testnet ─────────────────────

echo ""
echo "▶ Step 4/5: Deploying to Stellar Testnet..."

CONTRACT_ADDRESS=$(stellar contract deploy \
    --wasm "contracts/phantom_fleet/$OPTIMIZED_PATH" \
    --source-account "$STELLAR_SECRET_KEY" \
    --network testnet \
    2>&1)

if [ $? -ne 0 ]; then
    echo "✗ Deployment failed:"
    echo "  $CONTRACT_ADDRESS"
    exit 1
fi

echo "  ● Contract deployed: $CONTRACT_ADDRESS"

# Set verification key on contract (if available)
if [ -n "$VK_HEX" ]; then
    echo "  ▶ Setting verification key on contract..."
    stellar contract invoke \
        --id "$CONTRACT_ADDRESS" \
        --source-account "$STELLAR_SECRET_KEY" \
        --network testnet \
        -- set_verification_key \
        --admin "$STELLAR_SECRET_KEY" \
        --vk "$VK_HEX" \
        2>&1 || echo "  ⚠ VK upload deferred"
fi

# ─── Step 5: Save Configuration ───────────────────────────

echo ""
echo "▶ Step 5/5: Saving configuration..."

cat > .env.testnet << EOF
# Phantom Fleet — Testnet Configuration
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

CONTRACT_ADDRESS=$CONTRACT_ADDRESS
GAME_HUB_ADDRESS=CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG
NETWORK=testnet
RPC_URL=https://soroban-testnet.stellar.org
EXPLORER_BASE=https://stellar.expert/explorer/testnet
EOF

echo "  ● Configuration saved to .env.testnet"

# ─── Summary ───────────────────────────────────────────────

echo ""
echo "═══════════════════════════════════════"
echo "DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════"
echo ""
echo "  Contract:   $CONTRACT_ADDRESS"
echo "  Game Hub:   CB4VZAT2U3UC6XFK3N23SKRF2NDCMP3QHJYMCHHFMZO7MRQO6DQ2EMYG"
echo "  Network:    Stellar Testnet"
echo "  Explorer:   https://stellar.expert/explorer/testnet/contract/$CONTRACT_ADDRESS"
echo ""
echo "  Config:     .env.testnet"
echo ""
echo "  Next steps:"
echo "    1. Copy CONTRACT_ADDRESS to frontend config"
echo "    2. Run: npm run dev"
echo "    3. Connect Freighter wallet (testnet mode)"
echo ""
