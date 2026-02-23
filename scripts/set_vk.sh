#!/bin/bash
set -e

if [ -z "$STELLAR_SECRET_KEY" ]; then
    echo "❌ Error: STELLAR_SECRET_KEY not found in environment."
    echo "Please run: export STELLAR_SECRET_KEY=S..."
    exit 1
fi

CONTRACT_ADDRESS="CCXT66VF4VJYZFCKB6BF7UEBWHQN7M45RPG3BV4ODKL7U3T4MZFDMRV7"

echo "Using Contract Address: $CONTRACT_ADDRESS"

echo "▶ 1. Re-compiling Noir circuit..."
cd circuits/phantom_fleet
nargo compile

echo "▶ 2. Extracting Verification Key (vk.bin) using Barretenberg..."
bb write_vk -b ./target/phantom_fleet.json -o ./target/vk.bin

VK_HEX=$(xxd -p ./target/vk.bin | tr -d '\n')
echo "  ● VK extracted (${#VK_HEX} hex chars)"

echo "▶ 3. Setting Verification Key on Contract..."
cd ../..

stellar contract invoke \
    --id "$CONTRACT_ADDRESS" \
    --source-account "$STELLAR_SECRET_KEY" \
    --network testnet \
    -- set_verification_key \
    --admin "$STELLAR_SECRET_KEY" \
    --vk "$VK_HEX"

echo "✅ SUCCESS: Verification key set on chain at $CONTRACT_ADDRESS!"
