#!/bin/bash
set -e

SOURCE_ALIAS="${STELLAR_KEY_ALIAS:-adelanta}"

CONTRACT_ADDRESS="CCHEJT376LTPQ4DZFOJZBO3BEXC3JEVT4IQAOL6EVHBJOPDY4K7ZEEAD"
ADMIN_ADDRESS="$(stellar keys address "$SOURCE_ALIAS")"

echo "Using Contract Address: $CONTRACT_ADDRESS"
echo "Using Source Alias: $SOURCE_ALIAS"
echo "Using Admin Address: $ADMIN_ADDRESS"

echo "▶ 1. Re-compiling Noir circuit..."
cd circuits/phantom_fleet
nargo compile

echo "▶ 2. Building contract-compatible VK payload..."
node ../../node_modules/@aztec/bb.js/dest/node/main.js \
  write_vk \
  -b ./target/phantom_fleet.json \
  -o ./target/vk_js.bin

node ../../node_modules/@aztec/bb.js/dest/node/main.js \
  vk_as_fields \
  -k ./target/vk_js.bin \
  -o ./target/vk_fields.json

python3 - <<'PY'
import json

arr = json.load(open('./target/vk_fields.json'))
coords = arr[1:]
payload = b''.join((int(x, 0) % (1 << 256)).to_bytes(32, 'big') for x in coords)

with open('./target/vk_contract.hex', 'w') as f:
    f.write(payload.hex())

print(f"  ● VK fields: {len(coords)}")
print(f"  ● VK bytes (contract payload): {len(payload)}")
print(f"  ● VK hex chars: {len(payload.hex())}")

if len(payload) < 512 or ((len(payload) - 448) % 64 != 0):
    raise SystemExit('❌ Invalid contract VK shape after conversion')
PY

VK_HEX=$(cat ./target/vk_contract.hex)

echo "▶ 3. Setting Verification Key on Contract..."
cd ../..

stellar contract invoke \
    --id "$CONTRACT_ADDRESS" \
    --source "$SOURCE_ALIAS" \
    --network testnet \
    -- set_verification_key \
    --admin "$ADMIN_ADDRESS" \
    --vk "$VK_HEX"

echo "▶ 4. Verifying VK state on-chain..."
VK_STATUS=$(stellar contract invoke \
    --id "$CONTRACT_ADDRESS" \
    --source "$SOURCE_ALIAS" \
    --network testnet \
    -- has_verification_key)

if [ "$VK_STATUS" != "true" ]; then
    echo "❌ Verification key upload did not persist (has_verification_key=$VK_STATUS)"
    exit 1
fi

echo "✅ SUCCESS: Verification key set on chain at $CONTRACT_ADDRESS!"
