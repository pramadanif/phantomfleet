import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildPoseidon } from 'circomlibjs';

const CONTRACT_ID = process.env.PHANTOM_FLEET_CONTRACT || 'CCO5NIUW6B4HPLUUA6YOMNJ6F5OXMUJDUOZQFNAJLKWXWOTVEVL224KQ';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const SOURCE_ALIAS = process.env.STELLAR_KEY_ALIAS || 'adelanta';
const OPPONENT_ALIAS = process.env.OPPONENT_KEY_ALIAS || 'phantom-opponent';

const CIRCOM_DIR = path.resolve('circuits/circom');
const BUILD_DIR = path.join(CIRCOM_DIR, 'build');

const PLAYER1_GRID = [
  1, 1, 1, 1, 0, 0,
  1, 1, 1, 0, 0, 0,
  0, 0, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1,
];

const PLAYER2_GRID = [
  0, 0, 0, 0, 1, 1,
  0, 0, 0, 1, 1, 1,
  0, 0, 1, 1, 0, 0,
  0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1,
  1, 0, 0, 0, 0, 0,
];

function run(cmd, args, cwd = process.cwd()) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function runWithInput(cmd, args, input, cwd = process.cwd()) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', input });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function runStellar(args) {
  return run('stellar', args);
}

function fieldToHex32(value) {
  const bigintValue = BigInt(value);
  return bigintValue.toString(16).padStart(64, '0').slice(-64);
}

function reverseHexBytes(hex) {
  return hex.match(/../g).reverse().join('');
}

function fieldToHex32WithEndian(value, endian) {
  const be = fieldToHex32(value);
  return endian === 'le' ? reverseHexBytes(be) : be;
}

function g1ToHex(point, options) {
  const x = fieldToHex32WithEndian(point[0], options.fieldEndian);
  const y = fieldToHex32WithEndian(point[1], options.fieldEndian);
  return options.g1Order === 'yx' ? y + x : x + y;
}

function g2ToHex(point, options) {
  const xPair = point[0].slice(0, 2);
  const yPair = point[1].slice(0, 2);

  const x0 = options.swapFq2 ? xPair[1] : xPair[0];
  const x1 = options.swapFq2 ? xPair[0] : xPair[1];
  const y0 = options.swapFq2 ? yPair[1] : yPair[0];
  const y1 = options.swapFq2 ? yPair[0] : yPair[1];

  const x0h = fieldToHex32WithEndian(x0, options.fieldEndian);
  const x1h = fieldToHex32WithEndian(x1, options.fieldEndian);
  const y0h = fieldToHex32WithEndian(y0, options.fieldEndian);
  const y1h = fieldToHex32WithEndian(y1, options.fieldEndian);

  if (options.g2Order === 'yx') {
    return y0h + y1h + x0h + x1h;
  }
  return x0h + x1h + y0h + y1h;
}

function vkToContractHex(vkJson, options) {
  const alpha = g1ToHex(vkJson.vk_alpha_1, options);
  const beta = g2ToHex(vkJson.vk_beta_2, options);
  const gamma = g2ToHex(vkJson.vk_gamma_2, options);
  const delta = g2ToHex(vkJson.vk_delta_2, options);
  const ic = vkJson.IC.map((p) => g1ToHex(p, options)).join('');
  return alpha + beta + gamma + delta + ic;
}

function proofToHex256(proofJson, options) {
  const a = g1ToHex(proofJson.pi_a, options);
  const b = g2ToHex(proofJson.pi_b, options);
  const c = g1ToHex(proofJson.pi_c, options);
  const hex = a + b + c;
  if (hex.length !== 512) {
    throw new Error(`Expected 512 hex chars (256 bytes) proof, got ${hex.length}`);
  }
  return hex;
}

async function ensureCircomArtifacts() {
  const wasmPath = path.join(BUILD_DIR, 'phantom_fleet_js', 'phantom_fleet.wasm');
  const r1csPath = path.join(BUILD_DIR, 'phantom_fleet.r1cs');
  const zkeyPath = path.join(BUILD_DIR, 'circuit_final.zkey');
  const vkPath = path.join(BUILD_DIR, 'verification_key.json');
  const ptau0Path = path.join(BUILD_DIR, 'pot14_0000.ptau');
  const ptau1Path = path.join(BUILD_DIR, 'pot14_0001.ptau');
  const ptauPath = path.join(BUILD_DIR, 'pot14_final.ptau');

  if (!fs.existsSync(wasmPath) || !fs.existsSync(r1csPath)) {
    run('circom', ['phantom_fleet.circom', '--r1cs', '--wasm', '--sym', '-o', 'build'], CIRCOM_DIR);
  }

  if (!fs.existsSync(ptauPath)) {
    if (!fs.existsSync(ptau0Path)) {
      run('npx', ['snarkjs', 'powersoftau', 'new', 'bn128', '14', 'build/pot14_0000.ptau', '-v'], CIRCOM_DIR);
    }
    runWithInput('npx', ['snarkjs', 'powersoftau', 'contribute', 'build/pot14_0000.ptau', 'build/pot14_0001.ptau'], `phantomfleet-ptau-${Date.now()}\n`, CIRCOM_DIR);
    if (!fs.existsSync(ptau1Path)) {
      throw new Error('Failed to create build/pot14_0001.ptau');
    }
    run('npx', ['snarkjs', 'powersoftau', 'prepare', 'phase2', 'build/pot14_0001.ptau', 'build/pot14_final.ptau', '-v'], CIRCOM_DIR);
  }

  if (!fs.existsSync(zkeyPath) || !fs.existsSync(vkPath)) {
    run('npx', ['snarkjs', 'groth16', 'setup', 'build/phantom_fleet.r1cs', 'build/pot14_final.ptau', 'build/circuit_0000.zkey'], CIRCOM_DIR);
    runWithInput('npx', ['snarkjs', 'zkey', 'contribute', 'build/circuit_0000.zkey', 'build/circuit_final.zkey'], `phantomfleet-zkey-${Date.now()}\n`, CIRCOM_DIR);
    run('npx', ['snarkjs', 'zkey', 'export', 'verificationkey', 'build/circuit_final.zkey', 'build/verification_key.json'], CIRCOM_DIR);
  }
}

async function main() {
  await ensureCircomArtifacts();

  const player1 = runStellar(['keys', 'address', SOURCE_ALIAS]);
  const player2 = runStellar(['keys', 'address', OPPONENT_ALIAS]);

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const poseidonHashDec = (...inputs) => {
    const prepared = inputs.map((value) => F.e(BigInt(value)));
    const hash = poseidon(prepared);
    return F.toString(hash);
  };

  const computeCommitmentDec = (grid, nonce) => {
    const chunk1 = poseidonHashDec(...grid.slice(0, 15));
    const chunk2 = poseidonHashDec(...grid.slice(15, 30));
    const chunk3 = poseidonHashDec(...grid.slice(30, 36), 0);
    const gridHash = poseidonHashDec(chunk1, chunk2, chunk3);
    return poseidonHashDec(gridHash, nonce);
  };

  const p1Nonce = BigInt('0x' + crypto.randomBytes(31).toString('hex'));
  const p2Nonce = BigInt('0x' + crypto.randomBytes(31).toString('hex'));

  const p1CommitmentDec = computeCommitmentDec(PLAYER1_GRID, p1Nonce);
  const p2CommitmentDec = computeCommitmentDec(PLAYER2_GRID, p2Nonce);

  const targetX = 4;
  const targetY = 0;
  const targetIndex = targetY * 6 + targetX;
  const isHit = PLAYER2_GRID[targetIndex] === 1;
  if (!isHit) {
    throw new Error('This E2E expects a hit scenario at (4,0).');
  }

  const inputJsonPath = path.join(BUILD_DIR, 'input.json');
  fs.writeFileSync(
    inputJsonPath,
    JSON.stringify(
      {
        ship_grid: PLAYER2_GRID,
        layout_nonce: p2Nonce.toString(),
        target_x: targetX,
        target_y: targetY,
        layout_commitment: p2CommitmentDec,
        min_dist: 0,
        max_dist: 0,
        is_hit: 1,
      },
      null,
      2
    )
  );

  run('npx', ['snarkjs', 'wtns', 'calculate', 'build/phantom_fleet_js/phantom_fleet.wasm', 'build/input.json', 'build/witness.wtns'], CIRCOM_DIR);
  run('npx', ['snarkjs', 'groth16', 'prove', 'build/circuit_final.zkey', 'build/witness.wtns', 'build/proof.json', 'build/public.json'], CIRCOM_DIR);
  const verifyOut = run('npx', ['snarkjs', 'groth16', 'verify', 'build/verification_key.json', 'build/public.json', 'build/proof.json'], CIRCOM_DIR);
  if (!verifyOut.toLowerCase().includes('ok')) {
    throw new Error(`Local Groth16 verification failed: ${verifyOut}`);
  }

  const vkJson = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'verification_key.json'), 'utf8'));
  const proofJson = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'proof.json'), 'utf8'));
  const publicSignals = JSON.parse(fs.readFileSync(path.join(BUILD_DIR, 'public.json'), 'utf8'));

  if (publicSignals.length !== 6) {
    throw new Error(`Unexpected public signal length: ${publicSignals.length}`);
  }

  if (BigInt(publicSignals[0]) !== BigInt(p2CommitmentDec)) {
    throw new Error('Public signal[0] is not defender commitment.');
  }

  let lastError = null;

  const preferredVariant = {
    fieldEndian: 'be',
    g1Order: 'xy',
    g2Order: 'xy',
    swapFq2: true,
    publicEndian: 'be',
  };

  const encodingVariants = [preferredVariant];
  if (process.env.BRUTE_FORCE_ENCODINGS === '1') {
    const seen = new Set([JSON.stringify(preferredVariant)]);
    for (const fieldEndian of ['be', 'le']) {
      for (const g1Order of ['xy', 'yx']) {
        for (const g2Order of ['xy', 'yx']) {
          for (const swapFq2 of [false, true]) {
            for (const publicEndian of ['be', 'le']) {
              const variant = { fieldEndian, g1Order, g2Order, swapFq2, publicEndian };
              const key = JSON.stringify(variant);
              if (!seen.has(key)) {
                seen.add(key);
                encodingVariants.push(variant);
              }
            }
          }
        }
      }
    }
  }

  for (const variant of encodingVariants) {
    try {
      const hasVk = runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', SOURCE_ALIAS,
        '--network', NETWORK,
        '--',
        'has_verification_key',
      ]);

      if (hasVk !== 'true' || process.env.FORCE_SET_VK === '1') {
        const vkHex = vkToContractHex(vkJson, variant);
        const adminAddress = runStellar(['keys', 'address', SOURCE_ALIAS]);
        runStellar([
          'contract', 'invoke',
          '--id', CONTRACT_ID,
          '--source', SOURCE_ALIAS,
          '--network', NETWORK,
          '--',
          'set_verification_key',
          '--admin', adminAddress,
          '--vk', vkHex,
        ]);
      }

      const hasVkAfter = runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', SOURCE_ALIAS,
        '--network', NETWORK,
        '--',
        'has_verification_key',
      ]);

      if (hasVkAfter !== 'true') {
        throw new Error(`VK not active on-chain for variant=${JSON.stringify(variant)}`);
      }

      const gameId = crypto.randomBytes(32).toString('hex');
      const p1CommitmentHex = fieldToHex32WithEndian(p1CommitmentDec, variant.publicEndian);
      const p2CommitmentHex = fieldToHex32WithEndian(p2CommitmentDec, variant.publicEndian);

      runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', SOURCE_ALIAS,
        '--network', NETWORK,
        '--',
        'initialize_game',
        '--game_id', gameId,
        '--player1', player1,
        '--player2', player2,
      ]);

      runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', SOURCE_ALIAS,
        '--network', NETWORK,
        '--',
        'commit_layout',
        '--game_id', gameId,
        '--player', player1,
        '--commitment', p1CommitmentHex,
      ]);

      runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', OPPONENT_ALIAS,
        '--network', NETWORK,
        '--',
        'commit_layout',
        '--game_id', gameId,
        '--player', player2,
        '--commitment', p2CommitmentHex,
      ]);

      const proofHex = proofToHex256(proofJson, variant);
      const publicInputsHex = publicSignals.map((value) => fieldToHex32WithEndian(value, variant.publicEndian));

      const fireOutput = runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', SOURCE_ALIAS,
        '--network', NETWORK,
        '--',
        'fire_shot',
        '--game_id', gameId,
        '--shooter', player1,
        '--target_x', String(targetX),
        '--target_y', String(targetY),
      ]);

      const pendingOutput = runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', SOURCE_ALIAS,
        '--network', NETWORK,
        '--',
        'has_pending_shot',
        '--game_id', gameId,
      ]);

      const resolveOutput = runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', OPPONENT_ALIAS,
        '--network', NETWORK,
        '--',
        'resolve_shot',
        '--game_id', gameId,
        '--resolver', player2,
        '--proof', proofHex,
        '--public_inputs', JSON.stringify(publicInputsHex),
      ]);

      const historyOutput = runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', SOURCE_ALIAS,
        '--network', NETWORK,
        '--',
        'get_shot_history',
        '--game_id', gameId,
      ]);

      const stateOutput = runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', SOURCE_ALIAS,
        '--network', NETWORK,
        '--',
        'get_game_state',
        '--game_id', gameId,
      ]);

      console.log(`SUCCESS_VARIANT=${JSON.stringify(variant)}`);
      console.log(`GAME_ID=${gameId}`);
      console.log(`FIRE_RESULT=${fireOutput}`);
      console.log(`HAS_PENDING_AFTER_FIRE=${pendingOutput}`);
      console.log(`RESOLVE_RESULT=${resolveOutput}`);
      console.log(`SHOT_HISTORY=${historyOutput}`);
      console.log(`GAME_STATE=${stateOutput}`);
      return;
    } catch (error) {
      lastError = error;
      console.log(`VARIANT=${JSON.stringify(variant)} failed: ${error.message || error}`);
    }
  }

  throw lastError || new Error('All G2 encoding variants failed.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
