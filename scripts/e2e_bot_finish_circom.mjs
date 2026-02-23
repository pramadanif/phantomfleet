import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

const CONTRACT_ID = process.env.PHANTOM_FLEET_CONTRACT || 'CAN3TAI7W6ASCRCVBRIZFC6YXGZ36PPWWFXDDJS35RJ4JSRZEZT2TWRJ';
const NETWORK = process.env.STELLAR_NETWORK || 'testnet';
const PLAYER_ALIAS = process.env.STELLAR_KEY_ALIAS || 'adelanta';
const API_BASE = process.env.BOT_API_BASE || 'http://localhost:3000';

const WASM_PATH = path.resolve('public/circuits/circom/phantom_fleet.wasm');
const ZKEY_PATH = path.resolve('public/circuits/circom/circuit_final.zkey');

const PLAYER_GRID = [
  1, 1, 1, 1, 0, 0,
  1, 1, 1, 0, 0, 0,
  0, 0, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 1,
];

const BOT_GRID = [
  0, 1, 1, 1, 1, 0,
  0, 0, 0, 0, 0, 0,
  1, 1, 1, 0, 0, 0,
  0, 0, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 1,
];

const ENCODING = {
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

function gameIdTextToHex32(gameIdText) {
  const bytes = new Uint8Array(32);
  const text = new TextEncoder().encode(gameIdText);
  bytes.set(text.slice(0, 32));
  return Buffer.from(bytes).toString('hex');
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

function g2ToHexSwapFq2(point, options) {
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
  const b = g2ToHexSwapFq2(proofJson.pi_b, options);
  const c = g1ToHex(proofJson.pi_c, options);
  const hex = a + b + c;
  if (hex.length !== 512) {
    throw new Error(`Expected 512 hex chars proof, got ${hex.length}`);
  }
  return hex;
}

function decodeStatus(raw) {
  const text = String(raw || '').toLowerCase();
  if (text.includes('finished')) return 'Finished';
  if (text.includes('active')) return 'Active';
  return 'WaitingForCommitments';
}

function parseTurnAddress(rawState) {
  const text = String(rawState || '');
  const found = text.match(/current_turn\s*:\s*([CG][A-Z0-9]{20,})/i);
  return found ? found[1] : '';
}

function parsePending(rawPending) {
  const text = String(rawPending || '');
  const shooter = (text.match(/shooter\s*:\s*([CG][A-Z0-9]{20,})/i) || [])[1] || '';
  const targetX = Number((text.match(/target_x\s*:\s*(\d+)/i) || [])[1] || '0');
  const targetY = Number((text.match(/target_y\s*:\s*(\d+)/i) || [])[1] || '0');
  return { shooter, targetX, targetY };
}

function shipTargets(grid) {
  const cells = [];
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 1) {
      cells.push({ x: i % 6, y: Math.floor(i / 6) });
    }
  }
  return cells;
}

async function computeCommitmentDec(grid, nonceDec) {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const h = (...inputs) => {
    const prepared = inputs.map((v) => F.e(BigInt(v)));
    return F.toString(poseidon(prepared));
  };

  const chunk1 = h(...grid.slice(0, 15));
  const chunk2 = h(...grid.slice(15, 30));
  const chunk3 = h(...grid.slice(30, 36), 0);
  const gridHash = h(chunk1, chunk2, chunk3);
  return h(gridHash, nonceDec);
}

async function callBotApi(action, payload) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(`${API_BASE}/api/bot/onchain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || res.statusText || `http_${res.status}`);
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  throw new Error(`bot api ${action} failed after retries: ${lastError?.message || lastError}`);
}

async function resolveIncomingForPlayer({ gameIdHex, playerAddress, playerNonceDec, targetX, targetY }) {
  const commitmentDec = await computeCommitmentDec(PLAYER_GRID, playerNonceDec);
  const input = {
    ship_grid: PLAYER_GRID,
    layout_nonce: playerNonceDec,
    target_x: targetX,
    target_y: targetY,
    layout_commitment: commitmentDec,
    min_dist: 0,
    max_dist: 0,
    is_hit: PLAYER_GRID[targetY * 6 + targetX] === 1 ? 1 : 0,
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
  if (!Array.isArray(publicSignals) || publicSignals.length !== 6) {
    throw new Error(`unexpected publicSignals len: ${publicSignals?.length}`);
  }

  const proofHex = proofToHex256(proof, ENCODING);
  const publicInputsHex = publicSignals.map((x) => fieldToHex32WithEndian(x, ENCODING.publicEndian));

  return runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER_ALIAS,
    '--network', NETWORK,
    '--',
    'resolve_shot',
    '--game_id', gameIdHex,
    '--resolver', playerAddress,
    '--proof', proofHex,
    '--public_inputs', JSON.stringify(publicInputsHex),
  ]);
}

async function main() {
  if (!process.env.PHANTOM_BOT_SECRET_KEY) {
    console.warn('WARN: PHANTOM_BOT_SECRET_KEY not in this shell env. Ensure dev server has it in .env.local');
  }

  console.log(`BOT_TEST_START api=${API_BASE} network=${NETWORK}`);

  const playerAddress = runStellar(['keys', 'address', PLAYER_ALIAS]);
  const gameId = `BOT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const gameIdHex = gameIdTextToHex32(gameId);
  const playerNonce = BigInt('0x' + crypto.randomBytes(31).toString('hex'));
  const playerNonceDec = playerNonce.toString();

  const playerCommitmentDec = await computeCommitmentDec(PLAYER_GRID, playerNonceDec);
  const playerCommitHex = fieldToHex32WithEndian(playerCommitmentDec, ENCODING.publicEndian);

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER_ALIAS,
    '--network', NETWORK,
    '--',
    'initialize_game',
    '--game_id', gameIdHex,
    '--player1', playerAddress,
    '--player2', playerAddress,
  ]);
  console.log('INIT_GAME_OK');

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER_ALIAS,
    '--network', NETWORK,
    '--',
    'commit_layout',
    '--game_id', gameIdHex,
    '--player', playerAddress,
    '--commitment', playerCommitHex,
  ]);
  console.log('PLAYER_COMMIT_OK');

  await callBotApi('commit', { gameId, playerAddress });
  console.log('BOT_COMMIT_OK');

  const targets = shipTargets(BOT_GRID);
  let playerTargetIdx = 0;

  const maxSteps = 80;
  for (let step = 1; step <= maxSteps; step++) {
    const stateRaw = runStellar([
      'contract', 'invoke',
      '--id', CONTRACT_ID,
      '--source', PLAYER_ALIAS,
      '--network', NETWORK,
      '--',
      'get_game_state',
      '--game_id', gameIdHex,
    ]);

    const status = decodeStatus(stateRaw);
    if (status === 'Finished') {
      console.log(`STEP_${step}: status=Finished`);
      break;
    }

    const currentTurn = parseTurnAddress(stateRaw);
    const hasPending = runStellar([
      'contract', 'invoke',
      '--id', CONTRACT_ID,
      '--source', PLAYER_ALIAS,
      '--network', NETWORK,
      '--',
      'has_pending_shot',
      '--game_id', gameIdHex,
    ]) === 'true';

    if (hasPending) {
      const pendingRaw = runStellar([
        'contract', 'invoke',
        '--id', CONTRACT_ID,
        '--source', PLAYER_ALIAS,
        '--network', NETWORK,
        '--',
        'get_pending_shot',
        '--game_id', gameIdHex,
      ]);
      const pending = parsePending(pendingRaw);

      if (currentTurn === playerAddress && pending.shooter !== playerAddress) {
        await resolveIncomingForPlayer({
          gameIdHex,
          playerAddress,
          playerNonceDec,
          targetX: pending.targetX,
          targetY: pending.targetY,
        });
        console.log(`STEP_${step}: player resolve incoming (${pending.targetX},${pending.targetY})`);
      } else {
        const tick = await callBotApi('tick', { gameId, playerAddress });
        console.log(`STEP_${step}: bot tick on pending actions=${JSON.stringify(tick.actions || [])}`);
      }
    } else {
      if (currentTurn === playerAddress) {
        const target = targets[playerTargetIdx++];
        if (!target) {
          throw new Error('Ran out of bot ship targets before game finished');
        }
        runStellar([
          'contract', 'invoke',
          '--id', CONTRACT_ID,
          '--source', PLAYER_ALIAS,
          '--network', NETWORK,
          '--',
          'fire_shot',
          '--game_id', gameIdHex,
          '--shooter', playerAddress,
          '--target_x', String(target.x),
          '--target_y', String(target.y),
        ]);
        console.log(`STEP_${step}: player fire (${target.x},${target.y})`);
      } else {
        const tick = await callBotApi('tick', { gameId, playerAddress });
        console.log(`STEP_${step}: bot tick actions=${JSON.stringify(tick.actions || [])}`);
      }
    }

    const postState = runStellar([
      'contract', 'invoke',
      '--id', CONTRACT_ID,
      '--source', PLAYER_ALIAS,
      '--network', NETWORK,
      '--',
      'get_game_state',
      '--game_id', gameIdHex,
    ]);

    if (decodeStatus(postState) === 'Finished') {
      console.log(`STEP_${step}: status=Finished`);
      break;
    }
  }

  const finalState = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER_ALIAS,
    '--network', NETWORK,
    '--',
    'get_game_state',
    '--game_id', gameIdHex,
  ]);

  if (decodeStatus(finalState) !== 'Finished') {
    throw new Error('Bot game test did not reach Finished state');
  }

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', PLAYER_ALIAS,
    '--network', NETWORK,
    '--',
    'reveal_layout',
    '--game_id', gameIdHex,
    '--player', playerAddress,
    '--ship_grid', JSON.stringify(PLAYER_GRID),
    '--layout_nonce', fieldToHex32(playerNonce),
  ]);

  const botReveal = await callBotApi('reveal', { gameId, playerAddress });
  console.log(`BOT_REVEAL=${JSON.stringify(botReveal)}`);

  console.log('BOT_E2E_PASS=true');
  console.log(`GAME_ID=${gameId}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
