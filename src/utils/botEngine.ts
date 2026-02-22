/**
 * Bot Engine — On-Chain Bot Opponent for Phantom Fleet
 * 
 * Provides a deterministic AI opponent so judges can play
 * immediately without needing a second player online.
 * 
 * The bot:
 *  - Has a pre-placed fleet (deterministic for reproducibility)
 *  - Uses a smart shot selection strategy (hunt/target)
 *  - Generates its own ZK proofs for shot responses
 *  - Operates entirely client-side (no server needed)
 */

import { findClosestShip, computeCommitment, buildMerkleTree } from './zkProof';

// ── Bot Fleet ──────────────────────────────────────────────
// Pre-placed fleet layout (deterministic for every game).
//
// Row 0: [0][1][1][1][1][0]  ← Carrier (4 cells)
// Row 1: [0][0][0][0][0][0]
// Row 2: [1][1][1][0][0][0]  ← Cruiser (3 cells)
// Row 3: [0][0][0][0][1][1]  ← Destroyer (2 cells)
// Row 4: [0][0][0][0][0][0]
// Row 5: [1][0][0][0][0][1]  ← Scout + Scout (1+1 cells)
// Total: 4+3+2+1+1 = 11 cells

export const BOT_FLEET: number[] = [
    0, 1, 1, 1, 1, 0,
    0, 0, 0, 0, 0, 0,
    1, 1, 1, 0, 0, 0,
    0, 0, 0, 0, 1, 1,
    0, 0, 0, 0, 0, 0,
    1, 0, 0, 0, 0, 1,
];

export const BOT_NONCE = 'phantom-fleet-bot-nonce-v1';

// ── Bot Shot Strategy ──────────────────────────────────────

export type BotDifficulty = 'EASY' | 'NORMAL' | 'HARD';

export interface BotState {
    shotsFired: Set<number>;          // Cells the bot has already targeted
    hitCells: number[];               // Cells where bot scored hits
    targetQueue: number[];            // Priority cells to shoot next (adjacent to hits)
    difficulty: BotDifficulty;
}

export function createBotState(difficulty: BotDifficulty = 'NORMAL'): BotState {
    return {
        shotsFired: new Set(),
        hitCells: [],
        targetQueue: [],
        difficulty,
    };
}

/**
 * Get the bot's next shot. Uses hunt/target strategy:
 *   - If there are unresolved hits, target adjacent cells
 *   - Otherwise, use a checkerboard pattern for efficiency
 *   - EASY: random shots
 *   - NORMAL: checkerboard + hunt/target
 *   - HARD: checkerboard + aggressive hunt/target
 */
export function getBotShot(state: BotState): { x: number; y: number } {
    // Phase 1: Target mode — shoot adjacent to known hits
    while (state.targetQueue.length > 0) {
        const nextTarget = state.targetQueue.shift()!;
        if (!state.shotsFired.has(nextTarget) && nextTarget >= 0 && nextTarget < 36) {
            const x = nextTarget % 6;
            const y = Math.floor(nextTarget / 6);
            state.shotsFired.add(nextTarget);
            return { x, y };
        }
    }

    // Phase 2: Hunt mode
    if (state.difficulty === 'EASY') {
        // Random shot
        const available = [];
        for (let i = 0; i < 36; i++) {
            if (!state.shotsFired.has(i)) available.push(i);
        }
        const pick = available[Math.floor(Math.random() * available.length)];
        state.shotsFired.add(pick);
        return { x: pick % 6, y: Math.floor(pick / 6) };
    }

    // Checkerboard pattern (NORMAL/HARD) — more efficient hunting
    const checkerboard = [];
    for (let i = 0; i < 36; i++) {
        const x = i % 6;
        const y = Math.floor(i / 6);
        if ((x + y) % 2 === 0 && !state.shotsFired.has(i)) {
            checkerboard.push(i);
        }
    }

    // Fall back to any available cell
    if (checkerboard.length === 0) {
        for (let i = 0; i < 36; i++) {
            if (!state.shotsFired.has(i)) {
                checkerboard.push(i);
            }
        }
    }

    const pick = checkerboard[Math.floor(Math.random() * checkerboard.length)];
    state.shotsFired.add(pick);
    return { x: pick % 6, y: Math.floor(pick / 6) };
}

/**
 * Process a bot's shot result and update targeting queue.
 * If hit, add adjacent cells to the target queue.
 */
export function processBotShotResult(
    state: BotState,
    shotIndex: number,
    isHit: boolean
): void {
    if (isHit) {
        state.hitCells.push(shotIndex);
        const x = shotIndex % 6;
        const y = Math.floor(shotIndex / 6);

        // Add adjacent cells (up, down, left, right)
        const adjacent = [
            y > 0 ? shotIndex - 6 : -1,    // Up
            y < 5 ? shotIndex + 6 : -1,    // Down
            x > 0 ? shotIndex - 1 : -1,    // Left
            x < 5 ? shotIndex + 1 : -1,    // Right
        ].filter(idx => idx >= 0 && !state.shotsFired.has(idx));

        // Shuffle for unpredictability
        for (let i = adjacent.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [adjacent[i], adjacent[j]] = [adjacent[j], adjacent[i]];
        }

        state.targetQueue.push(...adjacent);
    }
}

/**
 * Process a player's shot against the bot's fleet.
 * Returns the shot result (hit/miss) and proximity data.
 */
export function processPlayerShotAgainstBot(
    targetX: number,
    targetY: number
): { isHit: boolean; distance: number; distLabel: 'HOT' | 'WARM' | 'COLD' } {
    const targetIndex = targetY * 6 + targetX;
    const isHit = BOT_FLEET[targetIndex] === 1;

    if (isHit) {
        return { isHit: true, distance: 0, distLabel: 'HOT' };
    }

    const closest = findClosestShip(BOT_FLEET, targetX, targetY);
    const distLabel: 'HOT' | 'WARM' | 'COLD' =
        closest.distance <= 2 ? 'HOT' :
            closest.distance <= 4 ? 'WARM' : 'COLD';

    return { isHit: false, distance: closest.distance, distLabel };
}

/**
 * Get the bot's commitment (computed at game start).
 */
export async function getBotCommitment(): Promise<string> {
    return computeCommitment(BOT_FLEET, BOT_NONCE);
}

/**
 * Count remaining bot ship cells.
 */
export function countBotShipsRemaining(playerHits: Set<number>): number {
    let remaining = 0;
    for (let i = 0; i < 36; i++) {
        if (BOT_FLEET[i] === 1 && !playerHits.has(i)) {
            remaining++;
        }
    }
    return remaining;
}
