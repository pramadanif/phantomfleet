import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { buildPoseidon } from 'circomlibjs';
import { Noir } from '@noir-lang/noir_js';
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';

const CONTRACT_ID = 'CCHEJT376LTPQ4DZFOJZBO3BEXC3JEVT4IQAOL6EVHBJOPDY4K7ZEEAD';
const SOURCE_ALIAS = process.env.STELLAR_KEY_ALIAS || 'adelanta';
const OPPONENT_ALIAS = process.env.OPPONENT_KEY_ALIAS || 'phantom-opponent';

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

function runStellar(args) {
  const res = spawnSync('stellar', args, { encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || 'stellar command failed').trim());
  }
  return (res.stdout || '').trim();
}

function fieldToHex32(value) {
  const bigintValue = BigInt(value);
  const hex = bigintValue.toString(16).padStart(64, '0');
  return hex.slice(-64);
}

async function main() {
  const circuitPath = 'circuits/phantom_fleet/target/phantom_fleet.json';
  if (!fs.existsSync(circuitPath)) {
    throw new Error(`Circuit artifact not found: ${circuitPath}`);
  }

  const player1 = runStellar(['keys', 'address', SOURCE_ALIAS]);
  const player2 = runStellar(['keys', 'address', OPPONENT_ALIAS]);

  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const poseidonHash = (...inputs) => {
    const inputElements = inputs.map((x) => F.e(BigInt(x)));
    const hash = poseidon(inputElements);
    return '0x' + F.toString(hash, 16).padStart(64, '0');
  };

  const computeCommitment = (grid, nonce) => {
    const chunk1 = poseidonHash(...grid.slice(0, 15));
    const chunk2 = poseidonHash(...grid.slice(15, 30));
    const chunk3 = poseidonHash(...grid.slice(30, 36), 0);
    const gridHash = poseidonHash(chunk1, chunk2, chunk3);
    return poseidonHash(gridHash, nonce);
  };

  const buildMerkleTree = (grid, nonce) => {
    const leaves = [];
    for (let i = 0; i < 36; i++) {
      const x = i % 6;
      const y = Math.floor(i / 6);
      leaves.push(poseidonHash(grid[i], x, y, nonce));
    }
    while (leaves.length < 64) {
      leaves.push(poseidonHash(0, leaves.length, 0, nonce));
    }

    const layers = [leaves.slice()];
    let current = leaves.slice();
    while (current.length > 1) {
      const next = [];
      for (let i = 0; i < current.length; i += 2) {
        const left = current[i];
        const right = current[i + 1] || left;
        next.push(poseidonHash(left, right));
      }
      layers.push(next);
      current = next;
    }

    return { root: current[0], layers, leaves: layers[0] };
  };

  const getMerklePath = (tree, leafIndex) => {
    const path = [];
    let idx = leafIndex;
    for (let level = 0; level < tree.layers.length - 1; level++) {
      const layer = tree.layers[level];
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      path.push([layer[siblingIdx] || layer[idx], isRight ? '1' : '0']);
      idx = Math.floor(idx / 2);
    }
    return path.slice(0, 6);
  };

  const findClosestShip = (grid, targetX, targetY) => {
    let closest = { x: 0, y: 0, distance: Number.POSITIVE_INFINITY };
    for (let i = 0; i < 36; i++) {
      if (grid[i] !== 1) continue;
      const x = i % 6;
      const y = Math.floor(i / 6);
      const d = Math.max(Math.abs(targetX - x), Math.abs(targetY - y));
      if (d < closest.distance) {
        closest = { x, y, distance: d };
      }
    }
    if (!Number.isFinite(closest.distance)) {
      throw new Error('No ship cells found in defender grid');
    }
    return closest;
  };

  const p1Nonce = BigInt('0x' + crypto.randomBytes(31).toString('hex'));
  const p2Nonce = BigInt('0x' + crypto.randomBytes(31).toString('hex'));

  const p1Commitment = computeCommitment(PLAYER1_GRID, p1Nonce);
  const p2Commitment = computeCommitment(PLAYER2_GRID, p2Nonce);

  const gameId = crypto.randomBytes(32).toString('hex');

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', SOURCE_ALIAS,
    '--network', 'testnet',
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
    '--network', 'testnet',
    '--',
    'commit_layout',
    '--game_id', gameId,
    '--player', player1,
    '--commitment', p1Commitment.slice(2),
  ]);

  runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', OPPONENT_ALIAS,
    '--network', 'testnet',
    '--',
    'commit_layout',
    '--game_id', gameId,
    '--player', player2,
    '--commitment', p2Commitment.slice(2),
  ]);

  const targetX = 4;
  const targetY = 0;
  const targetIndex = targetY * 6 + targetX;
  const isHit = PLAYER2_GRID[targetIndex] === 1;
  if (!isHit) {
    throw new Error('Selected target unexpectedly miss; this script expects a hit scenario');
  }

  const closest = findClosestShip(PLAYER2_GRID, targetX, targetY);
  const tree = buildMerkleTree(PLAYER2_GRID, p2Nonce);
  const closestIndex = closest.y * 6 + closest.x;
  const merklePath = getMerklePath(tree, closestIndex);

  const commitment = p2Commitment;
  const minDist = 0;
  const maxDist = 0;

  const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));
  const backend = new BarretenbergBackend(circuit);
  const noir = new Noir(circuit);

  const circuitInputs = {
    ship_grid: PLAYER2_GRID.map(String),
    merkle_path: merklePath,
    closest_ship_x: String(closest.x),
    closest_ship_y: String(closest.y),
    layout_nonce: '0x' + p2Nonce.toString(16).padStart(64, '0'),
    target_x: String(targetX),
    target_y: String(targetY),
    layout_commitment: commitment,
    min_dist: String(minDist),
    max_dist: String(maxDist),
    is_hit: '1',
  };

  const { witness } = await noir.execute(circuitInputs);
  const proofData = await backend.generateProof(witness);
  await backend.destroy();

  const proofBytes = Buffer.from(proofData.proof);
  console.log('PROOF_BYTES_LEN=' + proofBytes.length);
  if (proofBytes.length !== 256) {
    throw new Error(
      `Incompatible proof format: contract requires Groth16 256-byte proof, got ${proofBytes.length} bytes from current Noir/Barretenberg backend.`
    );
  }

  const publicInputsHex = [
    commitment,
    String(targetX),
    String(targetY),
    String(minDist),
    String(maxDist),
    '1',
  ].map(fieldToHex32);

  const submitOutput = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', SOURCE_ALIAS,
    '--network', 'testnet',
    '--',
    'submit_shot',
    '--game_id', gameId,
    '--shooter', player1,
    '--target_x', String(targetX),
    '--target_y', String(targetY),
    '--proof', proofBytes.toString('hex'),
    '--public_inputs', JSON.stringify(publicInputsHex),
  ]);

  const stateOutput = runStellar([
    'contract', 'invoke',
    '--id', CONTRACT_ID,
    '--source', SOURCE_ALIAS,
    '--network', 'testnet',
    '--',
    'get_game_state',
    '--game_id', gameId,
  ]);

  console.log('GAME_ID=' + gameId);
  console.log('SHOT_RESULT=' + submitOutput);
  console.log('GAME_STATE=' + stateOutput);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
