import crypto from 'node:crypto';
import path from 'node:path';
import * as StellarSdk from '@stellar/stellar-sdk';
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

export const runtime = 'nodejs';

const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;
const PHANTOM_FLEET_CONTRACT = process.env.PHANTOM_FLEET_CONTRACT || 'CAN3TAI7W6ASCRCVBRIZFC6YXGZ36PPWWFXDDJS35RJ4JSRZEZT2TWRJ';
const BOT_SECRET_KEY = process.env.PHANTOM_BOT_SECRET_KEY || '';
const BOT_NONCE_SALT = process.env.PHANTOM_BOT_NONCE_SALT || 'phantomfleet-bot';

const BOT_GRID = [
  0, 1, 1, 1, 1, 0,
  0, 0, 0, 0, 0, 0,
  1, 1, 1, 0, 0, 0,
  0, 0, 0, 0, 1, 1,
  0, 0, 0, 0, 0, 0,
  1, 0, 0, 0, 0, 1,
];

const BN254_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function assertBotKeypair() {
  if (!BOT_SECRET_KEY) {
    throw new Error('PHANTOM_BOT_SECRET_KEY is required for on-chain bot actions');
  }
  return StellarSdk.Keypair.fromSecret(BOT_SECRET_KEY);
}

function gameIdToBytes(gameId: string): Buffer {
  const bytes = new Uint8Array(32);
  const text = new TextEncoder().encode(gameId);
  bytes.set(text.slice(0, 32));
  return Buffer.from(bytes);
}

function fieldToHex32(value: string | number | bigint): string {
  return BigInt(value).toString(16).padStart(64, '0').slice(-64);
}

function fieldToBytes32(value: string | number | bigint): Buffer {
  return Buffer.from(fieldToHex32(value), 'hex');
}

function g1ToHex(point: any): string {
  return fieldToHex32(point[0]) + fieldToHex32(point[1]);
}

function g2ToHexSwapFq2(point: any): string {
  const x0 = point[0][1];
  const x1 = point[0][0];
  const y0 = point[1][1];
  const y1 = point[1][0];
  return fieldToHex32(x0) + fieldToHex32(x1) + fieldToHex32(y0) + fieldToHex32(y1);
}

function proofToHex256(proofJson: any): string {
  const a = g1ToHex(proofJson.pi_a);
  const b = g2ToHexSwapFq2(proofJson.pi_b);
  const c = g1ToHex(proofJson.pi_c);
  return a + b + c;
}

async function computeCommitment(grid: number[], nonceDec: string): Promise<string> {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const h = (...inputs: Array<string | number | bigint>) => {
    const prepared = inputs.map((v) => F.e(BigInt(v)));
    return F.toString(poseidon(prepared));
  };

  const chunk1 = h(...grid.slice(0, 15));
  const chunk2 = h(...grid.slice(15, 30));
  const chunk3 = h(...grid.slice(30, 36), 0);
  const gridHash = h(chunk1, chunk2, chunk3);
  return h(gridHash, nonceDec);
}

function deriveBotNonceDec(gameId: string): string {
  const hash = crypto.createHash('sha256').update(`${BOT_NONCE_SALT}:${gameId}`).digest();
  const raw = BigInt(`0x${hash.toString('hex')}`);
  return (raw % BN254_R).toString();
}

async function submitSignedContractCall(
  sourceKeypair: StellarSdk.Keypair,
  method: string,
  args: StellarSdk.xdr.ScVal[]
): Promise<{ txHash: string }> {
  const server = new StellarSdk.rpc.Server(TESTNET_RPC_URL);
  const account = await server.getAccount(sourceKeypair.publicKey());
  const contract = new StellarSdk.Contract(PHANTOM_FLEET_CONTRACT);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '10000000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed (${method}): ${simulated.error}`);
  }

  const assembled = StellarSdk.rpc.assembleTransaction(tx, simulated).build();
  assembled.sign(sourceKeypair);

  const submitted = await server.sendTransaction(assembled);
  if (submitted.status === 'ERROR') {
    throw new Error(`Submission failed (${method})`);
  }

  let result = await server.getTransaction(submitted.hash);
  while (result.status === 'NOT_FOUND') {
    await new Promise((r) => setTimeout(r, 1000));
    result = await server.getTransaction(submitted.hash);
  }
  if (result.status === 'FAILED') {
    throw new Error(`On-chain failed (${method})`);
  }

  return { txHash: submitted.hash };
}

async function simulateReadonly(method: string, caller: string, args: StellarSdk.xdr.ScVal[] = []): Promise<any> {
  const server = new StellarSdk.rpc.Server(TESTNET_RPC_URL);
  const account = await server.getAccount(caller);
  const contract = new StellarSdk.Contract(PHANTOM_FLEET_CONTRACT);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Readonly simulation failed (${method}): ${simulated.error}`);
  }

  const simAny = simulated as any;
  const retval = simAny?.result?.retval ?? simAny?.results?.[0]?.retval;
  const scVal = typeof retval === 'string' ? StellarSdk.xdr.ScVal.fromXDR(retval, 'base64') : retval;
  return StellarSdk.scValToNative(scVal as StellarSdk.xdr.ScVal);
}

function parseGameState(native: any) {
  const rawStatus = native.status;
  const normalizedStatus = (() => {
    if (typeof rawStatus === 'string') {
      const lower = rawStatus.toLowerCase();
      if (lower.includes('active')) return 'active';
      if (lower.includes('finished')) return 'finished';
      return 'waiting';
    }
    if (rawStatus && typeof rawStatus === 'object') {
      const keys = Object.keys(rawStatus).map((k) => k.toLowerCase());
      if (keys.some((k) => k.includes('active'))) return 'active';
      if (keys.some((k) => k.includes('finished'))) return 'finished';
    }
    return 'waiting';
  })();

  return {
    player1: normalizeAddress(native.player1 ?? native.player_1 ?? ''),
    player2: normalizeAddress(native.player2 ?? native.player_2 ?? ''),
    currentTurn: normalizeAddress(native.current_turn ?? native.currentTurn ?? ''),
    status: normalizedStatus,
    turnNumber: Number(native.turn_number ?? native.turnNumber ?? 0),
  };
}

function normalizeAddress(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw?.toString === 'function') {
    const asString = raw.toString();
    if (typeof asString === 'string' && asString !== '[object Object]') return asString;
  }

  const maybeAddressKeys = ['address', 'accountId', 'account_id', 'value', 'val', 'id'];
  for (const key of maybeAddressKeys) {
    const value = raw?.[key];
    if (typeof value === 'string' && value.length > 10) return value;
  }

  if (raw && typeof raw === 'object') {
    for (const value of Object.values(raw)) {
      if (typeof value === 'string' && value.length > 10) return value;
      if (value && typeof value === 'object') {
        const nested = normalizeAddress(value);
        if (nested) return nested;
      }
    }
  }

  return String(raw);
}

function pickBotTarget(turnNumber: number) {
  const idx = Math.abs((turnNumber * 7 + 11) % 36);
  return { x: idx % 6, y: Math.floor(idx / 6) };
}

async function proveForBot(targetX: number, targetY: number, gameId: string) {
  const nonceDec = deriveBotNonceDec(gameId);
  const layoutCommitment = await computeCommitment(BOT_GRID, nonceDec);

  const isHit = BOT_GRID[targetY * 6 + targetX] === 1;

  // Compute Chebyshev proximity for misses
  let minDist = 0;
  let maxDist = 0;
  if (!isHit) {
      let closestDist = Infinity;
      for (let i = 0; i < 36; i++) {
          if (BOT_GRID[i] !== 1) continue;
          const cx = i % 6;
          const cy = Math.floor(i / 6);
          const d = Math.max(Math.abs(targetX - cx), Math.abs(targetY - cy));
          if (d < closestDist) closestDist = d;
      }
      if (closestDist <= 2) { minDist = 1; maxDist = 2; }
      else if (closestDist <= 4) { minDist = 3; maxDist = 4; }
      else { minDist = 5; maxDist = 8; }
  }

  const input = {
    ship_grid: BOT_GRID,
    layout_nonce: nonceDec,
    target_x: targetX,
    target_y: targetY,
    layout_commitment: layoutCommitment,
    min_dist: minDist,
    max_dist: maxDist,
    is_hit: isHit ? 1 : 0,
  };

  const wasmPath = path.resolve(process.cwd(), 'public/circuits/circom/phantom_fleet.wasm');
  const zkeyPath = path.resolve(process.cwd(), 'public/circuits/circom/circuit_final.zkey');
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

  const proofHex = proofToHex256(proof);
  const publicInputs = (publicSignals as string[]).map((v) => fieldToBytes32(v));
  return { proofHex, publicInputs };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body?.action || '');
    const gameId = String(body?.gameId || '');
    const caller = String(body?.playerAddress || '');

    if (!gameId || !caller) {
      return Response.json({ ok: false, error: 'gameId and playerAddress are required' }, { status: 400 });
    }

    const botKeypair = assertBotKeypair();
    const botAddress = botKeypair.publicKey();
    const gameIdBytes = gameIdToBytes(gameId);

    if (action === 'commit') {
      const nonceDec = deriveBotNonceDec(gameId);
      const commitment = await computeCommitment(BOT_GRID, nonceDec);
      const args = [
        StellarSdk.xdr.ScVal.scvBytes(gameIdBytes),
        StellarSdk.nativeToScVal(botAddress, { type: 'address' }),
        StellarSdk.xdr.ScVal.scvBytes(fieldToBytes32(commitment)),
      ];

      try {
        const tx = await submitSignedContractCall(botKeypair, 'commit_layout', args);
        return Response.json({ ok: true, botAddress, txHash: tx.txHash });
      } catch (error: any) {
        const msg = String(error?.message || error);
        if (msg.includes('AlreadyCommitted') || msg.includes('#9')) {
          return Response.json({ ok: true, botAddress, alreadyCommitted: true });
        }
        throw error;
      }
    }

    if (action === 'reveal') {
      const stateNative = await simulateReadonly('get_game_state', caller, [StellarSdk.xdr.ScVal.scvBytes(gameIdBytes)]);
      const state = parseGameState(stateNative);
      if (state.status !== 'finished') {
        return Response.json({ ok: true, skipped: 'game_not_finished' });
      }

      const hasReveal = await simulateReadonly('has_revealed_layout', caller, [
        StellarSdk.xdr.ScVal.scvBytes(gameIdBytes),
        StellarSdk.nativeToScVal(botAddress, { type: 'address' }),
      ]);
      if (hasReveal === true) {
        return Response.json({ ok: true, alreadyRevealed: true });
      }

      const nonceDec = deriveBotNonceDec(gameId);
      const gridVals = BOT_GRID.map((v) => StellarSdk.nativeToScVal(v, { type: 'u32' }));
      const revealArgs = [
        StellarSdk.xdr.ScVal.scvBytes(gameIdBytes),
        StellarSdk.nativeToScVal(botAddress, { type: 'address' }),
        StellarSdk.xdr.ScVal.scvVec(gridVals),
        StellarSdk.xdr.ScVal.scvBytes(fieldToBytes32(nonceDec)),
      ];
      const tx = await submitSignedContractCall(botKeypair, 'reveal_layout', revealArgs);
      return Response.json({ ok: true, txHash: tx.txHash });
    }

    if (action === 'tick') {
      const actions: string[] = [];
      const callerAddress = normalizeAddress(caller);

      const stateNative = await simulateReadonly('get_game_state', caller, [StellarSdk.xdr.ScVal.scvBytes(gameIdBytes)]);
      let state = parseGameState(stateNative);

      if (state.status === 'finished') {
        return Response.json({ ok: true, actions: ['finished'] });
      }

      const hasPending = await simulateReadonly('has_pending_shot', caller, [StellarSdk.xdr.ScVal.scvBytes(gameIdBytes)]);
      if (hasPending === true) {
        const pending = await simulateReadonly('get_pending_shot', caller, [StellarSdk.xdr.ScVal.scvBytes(gameIdBytes)]);
        const pendingShooter = normalizeAddress(pending.shooter ?? pending.shooter_address ?? '');

        const botIsResolverTurn = state.currentTurn && state.currentTurn !== callerAddress;
        const pendingFromPlayer = pendingShooter && pendingShooter !== botAddress;

        if (botIsResolverTurn && pendingFromPlayer) {
          const targetX = Number(pending.target_x ?? pending.targetX ?? 0);
          const targetY = Number(pending.target_y ?? pending.targetY ?? 0);
          const { proofHex, publicInputs } = await proveForBot(targetX, targetY, gameId);

          const resolveArgs = [
            StellarSdk.xdr.ScVal.scvBytes(gameIdBytes),
            StellarSdk.nativeToScVal(botAddress, { type: 'address' }),
            StellarSdk.xdr.ScVal.scvBytes(Buffer.from(proofHex, 'hex')),
            StellarSdk.xdr.ScVal.scvVec(publicInputs.map((b) => StellarSdk.xdr.ScVal.scvBytes(b))),
          ];

          await submitSignedContractCall(botKeypair, 'resolve_shot', resolveArgs);
          actions.push('resolved_player_shot');

          const refreshed = await simulateReadonly('get_game_state', caller, [StellarSdk.xdr.ScVal.scvBytes(gameIdBytes)]);
          state = parseGameState(refreshed);
        }
      }

      const hasPendingAfter = await simulateReadonly('has_pending_shot', caller, [StellarSdk.xdr.ScVal.scvBytes(gameIdBytes)]);
      const botIsShooterTurn = state.currentTurn && state.currentTurn !== callerAddress;
      if (hasPendingAfter !== true && botIsShooterTurn && state.status === 'active') {
        const target = pickBotTarget(state.turnNumber);
        const fireArgs = [
          StellarSdk.xdr.ScVal.scvBytes(gameIdBytes),
          StellarSdk.nativeToScVal(botAddress, { type: 'address' }),
          StellarSdk.nativeToScVal(target.x, { type: 'u32' }),
          StellarSdk.nativeToScVal(target.y, { type: 'u32' }),
        ];
        await submitSignedContractCall(botKeypair, 'fire_shot', fireArgs);
        actions.push(`fired_at_${target.x}_${target.y}`);
      }

      return Response.json({ ok: true, actions, botAddress });
    }

    return Response.json({ ok: false, error: 'Unsupported action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ ok: false, error: String(error?.message || error) }, { status: 500 });
  }
}
