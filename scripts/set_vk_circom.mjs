import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const CONTRACT_ID = process.env.CONTRACT_ID;
const SOURCE_ALIAS = process.env.STELLAR_KEY_ALIAS || 'adelanta';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';

if (!CONTRACT_ID) {
  console.error('Missing CONTRACT_ID env var. Example: CONTRACT_ID=CC... node scripts/set_vk_circom.mjs');
  process.exit(1);
}

function run(cmd, args, cwd = process.cwd()) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function fieldToHex32(value) {
  return BigInt(value).toString(16).padStart(64, '0').slice(-64);
}

function g1ToHex(point) {
  return fieldToHex32(point[0]) + fieldToHex32(point[1]);
}

function g2ToHexSwapFq2(point) {
  const x0 = point[0][1];
  const x1 = point[0][0];
  const y0 = point[1][1];
  const y1 = point[1][0];
  return fieldToHex32(x0) + fieldToHex32(x1) + fieldToHex32(y0) + fieldToHex32(y1);
}

function vkToContractHex(vkJson) {
  const alpha = g1ToHex(vkJson.vk_alpha_1);
  const beta = g2ToHexSwapFq2(vkJson.vk_beta_2);
  const gamma = g2ToHexSwapFq2(vkJson.vk_gamma_2);
  const delta = g2ToHexSwapFq2(vkJson.vk_delta_2);
  const ic = vkJson.IC.map(g1ToHex).join('');
  return alpha + beta + gamma + delta + ic;
}

async function main() {
  const vkPath = path.resolve('circuits/circom/build/verification_key.json');
  if (!fs.existsSync(vkPath)) {
    throw new Error(`Missing ${vkPath}. Generate Circom verification key first.`);
  }

  const vkJson = JSON.parse(fs.readFileSync(vkPath, 'utf8'));
  const vkHex = vkToContractHex(vkJson);

  if (vkHex.length < 1024 || ((vkHex.length / 2 - 448) % 64 !== 0)) {
    throw new Error(`Invalid VK payload shape. bytes=${vkHex.length / 2}`);
  }

  const adminAddress = run('stellar', ['keys', 'address', SOURCE_ALIAS]);

  console.log(`CONTRACT_ID=${CONTRACT_ID}`);
  console.log(`SOURCE_ALIAS=${SOURCE_ALIAS}`);
  console.log(`ADMIN_ADDRESS=${adminAddress}`);
  console.log(`VK_BYTES=${vkHex.length / 2}`);

  run('stellar', [
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', SOURCE_ALIAS,
    '--network', NETWORK,
    '--',
    'set_verification_key',
    '--admin', adminAddress,
    '--vk', vkHex,
  ]);

  const hasVk = run('stellar', [
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', SOURCE_ALIAS,
    '--network', NETWORK,
    '--',
    'has_verification_key',
  ]);

  if (hasVk !== 'true') {
    throw new Error(`VK not persisted. has_verification_key=${hasVk}`);
  }

  console.log('VK_SET_OK=true');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
