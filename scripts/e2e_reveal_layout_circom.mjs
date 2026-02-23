import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildPoseidon } from 'circomlibjs';
import * as snarkjs from 'snarkjs';

const CONTRACT_ID = process.env.PHANTOM_FLEET_CONTRACT || 'CAN3TAI7W6ASCRCVBRIZFC6YXGZ36PPWWFXDDJS35RJ4JSRZEZT2TWRJ';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const PLAYER1_ALIAS = process.env.STELLAR_KEY_ALIAS || 'adelanta';
const PLAYER2_ALIAS = process.env.OPPONENT_KEY_ALIAS || 'phantom-opponent';

const CIRCUIT_WASM = path.resolve('public/circuits/circom/phantom_fleet.wasm');
const CIRCUIT_ZKEY = path.resolve('public/circuits/circom/circuit_final.zkey');
const VK_JSON = path.resolve('circuits/circom/build/verification_key.json');

const PLAYER1_GRID = [
  1, 1, 1, 1, 0, 0,
  1, 1, 1, 0, 0, 0,
  0, 0, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1,
];

const PLAYER2_GRID = [
  0, 1, 1, 1, 1, 0,
  0, 0, 0, 0, 0, 0,
  1, 1, 1, 0, 0, 0,
  0, 0, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 1,
];

const VARIANT = {
  fieldEndian: 'be',
  g1Order: 'xy',
  g2Order: 'xy',
  swapFq2: true,
  publicEndian: 'be',
};

function run(cmd, args, cwd = process.cwd()) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')}\n${(result.stderr || result.stdout || '').trim()}`);
  }
  return (result.stdout || '').trim();
}

function sleep(seconds) {
  spawnSync('sleep', [String(seconds)], { encoding: 'utf8' });
}

function runStellar(args) {
  const maxAttempts = 5;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return run('stellar', args);
    } catch (error) {
      const message = String(error?.message || error);
      const retryable =
        message.includes('TxBadSeq') ||
        message.includes('txBAD_SEQ') ||
        message.includes('NOT_FOUND') ||
        message.includes('timeout') ||
        message.includes('temporarily unavailable');

      lastError = error;
      if (!retryable || attempt === maxAttempts) {
        throw error;
      }
      sleep(2);
    }
  }
  throw lastError;
}

function fieldToHex32(value) {
  return BigInt(value).toString(16).padStart(64, '0').slice(-64);
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

  return options.g2Order === 'yx'
    ? y0h + y1h + x0h + x1h
    : x0h + x1h + y0h + y1h;
}

function proofToHex256(proofJson, options) {
  const a = g1ToHex(proofJson.pi_a, options);
  const b = g2ToHex(proofJson.pi_b, options);
  const c = g1ToHex(proofJson.pi_c, options);
  const hex = a + b + c;
  if (hex.length !== 512) {
    throw new Error(`Invalid proof length: ${hex.length}`);
  }
  return hex;
}

function vkToContractHex(vkJson, options) {
  const alpha = g1ToHex(vkJson.vk_alpha_1, options);
  const beta = g2ToHex(vkJson.vk_beta_2, options);
  const gamma = g2ToHex(vkJson.vk_gamma_2, options);
  const delta = g2ToHex(vkJson.vk_delta_2, options);
  const ic = vkJson.IC.map((p) => g1ToHex(p, options)).join('');
  return alpha + beta + gamma + delta + ic;
}

function decodeStatus(raw) {
  const text = String(raw || '').toLowerCase();
  if (text.includes('finished')) return 'Finished';
  if (text.includes('active')) return 'Active';
  return 'WaitingForCommitments';
}

function getShipCells(grid) {
  const result = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1) {
      result.push({ x: i % 6, y: Math.floor(i / 6) });
    }
  }
  return result;
}

async function main() {
  if (!fs.existsSync(CIRCUIT_WASM) || !fs.existsSync(CIRCUIT_ZKEY)) {
    throw new Error('Missing circuit artifacts in public/circuits/circom (phantom_fleet.wasm / circuit_final.zkey)');
  }
  if (!fs.existsSync(VK_JSON)) {
    throw new Error('Missing verification key json at circuits/circom/build/verification_key.json');
  }

  const player1 = runStellar(['keys', 'address', PLAYER1_ALIAS]);
  const player2 = runStellar(['keys', 'address', PLAYER2_ALIAS]);

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const hDec = (...inputs) => {
    const prepared = inputs.map((value) => F.e(BigInt(value)));
    return F.toString(poseidon(prepared));
  };

  const computeCommitmentDec = (grid, nonce) => {
    const chunk1 = hDec(...grid.slice(0, 15));
    const chunk2 = hDec(...grid.slice(15, 30));
    const chunk3 = hDec(...grid.slice(30, 36), 0);
    const gridHash = hDec(chunk1, chunk2, chunk3);
    return hDec(gridHash, nonce);
  };

  const p1Nonce = BigInt('0x' + crypto.randomBytes(31).toString('hex'));
  const p2Nonce = BigInt('0x' + crypto.randomBytes(31).toString('hex'));

  const p1CommitmentDec = computeCommitmentDec(PLAYER1_GRID, p1Nonce);
  const p2CommitmentDec = computeCommitmentDec(PLAYER2_GRID, p2Nonce);

  const vkJson = JSON.parse(fs.readFileSync(VK_JSON, 'utf8'));

  const hasVk = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER1_ALIAS,
    '--network', NETWORK,
    '--',
    'has_verification_key',
  ]);

  if (hasVk !== 'true' || process.env.FORCE_SET_VK === '1') {
    const vkHex = vkToContractHex(vkJson, VARIANT);
    runStellar([
      'contract', 'invoke',
      '--id', CONTRACT_ID,
      '--source', PLAYER1_ALIAS,
      '--network', NETWORK,
      '--',
      'set_verification_key',
      '--admin', player1,
      '--vk', vkHex,
    ]);
  }

  const gameId = crypto.randomBytes(32).toString('hex');

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER1_ALIAS,
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
    '--source', PLAYER1_ALIAS,
    '--network', NETWORK,
    '--',
    'commit_layout',
    '--game_id', gameId,
    '--player', player1,
    '--commitment', fieldToHex32WithEndian(p1CommitmentDec, VARIANT.publicEndian),
  ]);

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER2_ALIAS,
    '--network', NETWORK,
    '--',
    'commit_layout',
    '--game_id', gameId,
    '--player', player2,
    '--commitment', fieldToHex32WithEndian(p2CommitmentDec, VARIANT.publicEndian),
  ]);

  const targetsOnP2 = getShipCells(PLAYER2_GRID);
  const targetsOnP1 = getShipCells(PLAYER1_GRID);
  let p1TargetIdx = 0;
  let p2TargetIdx = 0;

  let shooterAlias = PLAYER1_ALIAS;
  let shooterAddress = player1;
  let resolverAlias = PLAYER2_ALIAS;
  let resolverAddress = player2;
  let defenderGrid = PLAYER2_GRID;
  let defenderNonce = p2Nonce;

  const maxTurns = 30;
  for (let turn = 1; turn <= maxTurns; turn++) {
    const target = shooterAlias === PLAYER1_ALIAS
      ? targetsOnP2[p1TargetIdx++]
      : targetsOnP1[p2TargetIdx++];

    if (!target) {
      throw new Error(`No more targets for ${shooterAlias} at turn ${turn}`);
    }

    runStellar([
      'contract', 'invoke',
      '--id', CONTRACT_ID,
      '--source', shooterAlias,
      '--network', NETWORK,
      '--',
      'fire_shot',
      '--game_id', gameId,
      '--shooter', shooterAddress,
      '--target_x', String(target.x),
      '--target_y', String(target.y),
    ]);

    const commitmentDec = computeCommitmentDec(defenderGrid, defenderNonce);
    const input = {
      ship_grid: defenderGrid,
      layout_nonce: defenderNonce.toString(),
      target_x: target.x,
      target_y: target.y,
      layout_commitment: commitmentDec,
      min_dist: 0,
      max_dist: 0,
      is_hit: 1,
    };

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, CIRCUIT_WASM, CIRCUIT_ZKEY);
    if (!Array.isArray(publicSignals) || publicSignals.length !== 6) {
      throw new Error(`Unexpected public signal length at turn ${turn}`);
    }

    const proofHex = proofToHex256(proof, VARIANT);
    const publicInputsHex = publicSignals.map((value) => fieldToHex32WithEndian(value, VARIANT.publicEndian));

    runStellar([
      'contract', 'invoke',
      '--id', CONTRACT_ID,
      '--source', resolverAlias,
      '--network', NETWORK,
      '--',
      'resolve_shot',
      '--game_id', gameId,
      '--resolver', resolverAddress,
      '--proof', proofHex,
      '--public_inputs', JSON.stringify(publicInputsHex),
    ]);

    const stateOut = runStellar([
      'contract', 'invoke',
      '--id', CONTRACT_ID,
      '--source', PLAYER1_ALIAS,
      '--network', NETWORK,
      '--',
      'get_game_state',
      '--game_id', gameId,
    ]);

    const status = decodeStatus(stateOut);
    console.log(`TURN_${turn}: shooter=${shooterAlias} target=${target.x},${target.y} status=${status}`);

    if (status === 'Finished') {
      break;
    }

    if (shooterAlias === PLAYER1_ALIAS) {
      shooterAlias = PLAYER2_ALIAS;
      shooterAddress = player2;
      resolverAlias = PLAYER1_ALIAS;
      resolverAddress = player1;
      defenderGrid = PLAYER1_GRID;
      defenderNonce = p1Nonce;
    } else {
      shooterAlias = PLAYER1_ALIAS;
      shooterAddress = player1;
      resolverAlias = PLAYER2_ALIAS;
      resolverAddress = player2;
      defenderGrid = PLAYER2_GRID;
      defenderNonce = p2Nonce;
    }
  }

  const finalState = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER1_ALIAS,
    '--network', NETWORK,
    '--',
    'get_game_state',
    '--game_id', gameId,
  ]);

  if (decodeStatus(finalState) !== 'Finished') {
    throw new Error('Game did not reach Finished status; reveal cannot be tested yet.');
  }

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER1_ALIAS,
    '--network', NETWORK,
    '--',
    'reveal_layout',
    '--game_id', gameId,
    '--player', player1,
    '--ship_grid', JSON.stringify(PLAYER1_GRID),
    '--layout_nonce', fieldToHex32(p1Nonce),
  ]);

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER2_ALIAS,
    '--network', NETWORK,
    '--',
    'reveal_layout',
    '--game_id', gameId,
    '--player', player2,
    '--ship_grid', JSON.stringify(PLAYER2_GRID),
    '--layout_nonce', fieldToHex32(p2Nonce),
  ]);

  const p1HasReveal = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER1_ALIAS,
    '--network', NETWORK,
    '--',
    'has_revealed_layout',
    '--game_id', gameId,
    '--player', player1,
  ]);

  const p2HasReveal = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER1_ALIAS,
    '--network', NETWORK,
    '--',
    'has_revealed_layout',
    '--game_id', gameId,
    '--player', player2,
  ]);

  if (p1HasReveal !== 'true' || p2HasReveal !== 'true') {
    throw new Error(`Reveal failed: p1=${p1HasReveal} p2=${p2HasReveal}`);
  }

  const p1Reveal = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER1_ALIAS,
    '--network', NETWORK,
    '--',
    'get_revealed_layout',
    '--game_id', gameId,
    '--player', player1,
  ]);

  const p2Reveal = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER1_ALIAS,
    '--network', NETWORK,
    '--',
    'get_revealed_layout',
    '--game_id', gameId,
    '--player', player2,
  ]);

  console.log('REVEAL_TEST_PASS=true');
  console.log(`GAME_ID=${gameId}`);
  console.log(`PLAYER1_REVEALED=${p1HasReveal}`);
  console.log(`PLAYER2_REVEALED=${p2HasReveal}`);
  console.log(`PLAYER1_REVEAL=${p1Reveal}`);
  console.log(`PLAYER2_REVEAL=${p2Reveal}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
