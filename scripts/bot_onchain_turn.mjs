import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

const CONTRACT_ID = process.env.PHANTOM_FLEET_CONTRACT || 'CAN3TAI7W6ASCRCVBRIZFC6YXGZ36PPWWFXDDJS35RJ4JSRZEZT2TWRJ';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const SHOOTER_ALIAS_DEFAULT = process.env.BOT_KEY_ALIAS || 'adelanta';
const DEFENDER_ALIAS_DEFAULT = process.env.DEFENDER_KEY_ALIAS || '';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = '1';
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usageAndExit(message) {
  if (message) {
    console.error(message);
  }
  console.error(`\nUsage:\n  node scripts/bot_onchain_turn.mjs \\
    --game-id <32-byte-hex> \\
    --target-x <0..5> \\
    --target-y <0..5> \\
    --defender-grid-file <path-to-json-array-36> \\
    --defender-nonce <decimal-or-0x> \\
    [--shooter-alias <stellar-key-alias>] \\
    [--defender-alias <stellar-key-alias>] \\
    [--dry-run 1]\n\nExample:\n  node scripts/bot_onchain_turn.mjs \\
    --game-id 0123...abcd \\
    --target-x 4 --target-y 0 \\
    --defender-grid-file scripts/player_grid.json \\
    --defender-nonce 123456789 \\
    --shooter-alias adelanta --defender-alias player2\n`);
  process.exit(1);
}

function run(cmd, args, cwd = process.cwd()) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function runStellar(args) {
  return run('stellar', args);
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

function proofToHex256(proofJson) {
  const a = g1ToHex(proofJson.pi_a);
  const b = g2ToHexSwapFq2(proofJson.pi_b);
  const c = g1ToHex(proofJson.pi_c);
  const hex = a + b + c;
  if (hex.length !== 512) {
    throw new Error(`Invalid proof size: expected 512 hex chars, got ${hex.length}`);
  }
  return hex;
}

async function computeCommitmentDec(grid, nonce) {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const h = (...inputs) => {
    const prepared = inputs.map((value) => F.e(BigInt(value)));
    return F.toString(poseidon(prepared));
  };

  const chunk1 = h(...grid.slice(0, 15));
  const chunk2 = h(...grid.slice(15, 30));
  const chunk3 = h(...grid.slice(30, 36), 0);
  const gridHash = h(chunk1, chunk2, chunk3);
  return h(gridHash, nonce);
}

async function main() {
  const args = parseArgs(process.argv);

  const gameId = args['game-id'];
  const targetXRaw = args['target-x'];
  const targetYRaw = args['target-y'];
  const gridFile = args['defender-grid-file'];
  const defenderNonce = args['defender-nonce'];
  const shooterAlias = args['shooter-alias'] || SHOOTER_ALIAS_DEFAULT;
  const defenderAlias = args['defender-alias'] || DEFENDER_ALIAS_DEFAULT;
  const dryRun = args['dry-run'] === '1';

  if (!gameId || !targetXRaw || !targetYRaw || !gridFile || !defenderNonce) {
    usageAndExit('Missing required arguments.');
  }
  if (!defenderAlias) {
    usageAndExit('Missing defender alias. Provide --defender-alias or DEFENDER_KEY_ALIAS env var.');
  }
  if (shooterAlias === defenderAlias) {
    usageAndExit('shooter-alias and defender-alias must be different accounts.');
  }

  const targetX = Number(targetXRaw);
  const targetY = Number(targetYRaw);
  if (!Number.isInteger(targetX) || !Number.isInteger(targetY) || targetX < 0 || targetX > 5 || targetY < 0 || targetY > 5) {
    usageAndExit('target-x/target-y must be integers in range 0..5');
  }

  const gridPath = path.resolve(gridFile);
  const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8'));
  if (!Array.isArray(grid) || grid.length !== 36 || grid.some((v) => v !== 0 && v !== 1)) {
    usageAndExit('defender-grid-file must be a JSON array of 36 items containing only 0/1');
  }

  const targetIndex = targetY * 6 + targetX;
  const isHit = grid[targetIndex] === 1 ? 1 : 0;

  const minDist = 0;
  const maxDist = 0;
  const layoutCommitment = await computeCommitmentDec(grid, defenderNonce);

  const input = {
    ship_grid: grid,
    layout_nonce: defenderNonce,
    target_x: targetX,
    target_y: targetY,
    layout_commitment: layoutCommitment,
    min_dist: minDist,
    max_dist: maxDist,
    is_hit: isHit,
  };

  const wasmPath = path.resolve('public/circuits/circom/phantom_fleet.wasm');
  const zkeyPath = path.resolve('public/circuits/circom/circuit_final.zkey');

  if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
    throw new Error('Missing Circom artifacts in public/circuits/circom/. Run setup to publish wasm/zkey first.');
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  if (!Array.isArray(publicSignals) || publicSignals.length !== 6) {
    throw new Error(`Unexpected public signal length: ${publicSignals?.length ?? 'unknown'}`);
  }

  if (BigInt(publicSignals[0]) !== BigInt(layoutCommitment)) {
    throw new Error('Generated public signal commitment mismatch.');
  }

  const proofHex = proofToHex256(proof);
  const publicInputsHex = publicSignals.map((x) => fieldToHex32(x));

  const shooterAddress = runStellar(['keys', 'address', shooterAlias]);
  const defenderAddress = runStellar(['keys', 'address', defenderAlias]);

  console.log(`SHOOTER_ALIAS=${shooterAlias}`);
  console.log(`DEFENDER_ALIAS=${defenderAlias}`);
  console.log(`SHOOTER=${shooterAddress}`);
  console.log(`DEFENDER=${defenderAddress}`);
  console.log(`GAME_ID=${gameId}`);
  console.log(`TARGET=(${targetX},${targetY})`);
  console.log(`IS_HIT=${isHit}`);

  if (dryRun) {
    console.log('DRY_RUN=1 (no on-chain invoke)');
    console.log(`PROOF_LEN_BYTES=${proofHex.length / 2}`);
    return;
  }

  const fireOut = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', shooterAlias,
    '--network', NETWORK,
    '--',
    'fire_shot',
    '--game_id', gameId,
    '--shooter', shooterAddress,
    '--target_x', String(targetX),
    '--target_y', String(targetY),
  ]);

  const resolveOut = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', defenderAlias,
    '--network', NETWORK,
    '--',
    'resolve_shot',
    '--game_id', gameId,
    '--resolver', defenderAddress,
    '--proof', proofHex,
    '--public_inputs', JSON.stringify(publicInputsHex),
  ]);

  console.log(`FIRE_RESULT=${fireOut}`);
  console.log(`RESOLVE_RESULT=${resolveOut}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
