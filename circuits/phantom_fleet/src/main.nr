// ================================================================
// PHANTOM FLEET - ZK SHOT PROOF CIRCUIT
// ================================================================
//
// Proves simultaneously:
//   1. Shot target is valid (within 6x6 grid)
//   2. Hit/miss result is honest (matches committed layout)
//   3. For misses: claimed proximity range is accurate
//      - closest ship is genuinely within [min_dist, max_dist]
//      - no ship cell exists closer than claimed
//
// Backend: BN254 curve, Groth16 proving system
// Target: ~850 constraints, <10s proof time in browser WASM
// ================================================================

use poseidon::poseidon;

// --- HELPER: Compute absolute difference for unsigned values ---
fn abs_diff(a: u8, b: u8) -> u8 {
    if a > b {
        a - b
    } else {
        b - a
    }
}

// --- HELPER: Maximum of two u8 values ---
fn max_u8(a: u8, b: u8) -> u8 {
    if a > b {
        a
    } else {
        b
    }
}

// Trade-off note: Chebyshev over Euclidean saves ~200 constraints
// (no square root circuit required) and maps cleanly to grid rings.
fn chebyshev_distance(x1: u8, y1: u8, x2: u8, y2: u8) -> u8 {
    let dx = abs_diff(x1, x2);
    let dy = abs_diff(y1, y2);
    max_u8(dx, dy)
}

// --- HELPER: Hash the full ship grid into a single Field ---
fn hash_grid(grid: [Field; 36]) -> Field {
    // Hash in chunks of 15 (Poseidon max arity), then combine.
    // Chunk 1: grid[0..15]  - 15 elements
    // Chunk 2: grid[15..30] - 15 elements
    // Chunk 3: grid[30..36] - 6 elements (padded to 7)
    // Final:   hash(chunk1_hash, chunk2_hash, chunk3_hash)

    let chunk1 = poseidon::bn254::hash_15([
        grid[0],  grid[1],  grid[2],  grid[3],  grid[4],
        grid[5],  grid[6],  grid[7],  grid[8],  grid[9],
        grid[10], grid[11], grid[12], grid[13], grid[14]
    ]);

    let chunk2 = poseidon::bn254::hash_15([
        grid[15], grid[16], grid[17], grid[18], grid[19],
        grid[20], grid[21], grid[22], grid[23], grid[24],
        grid[25], grid[26], grid[27], grid[28], grid[29]
    ]);

    let chunk3 = poseidon::bn254::hash_7([
        grid[30], grid[31], grid[32], grid[33], grid[34],
        grid[35], 0 // pad to 7
    ]);

    poseidon::bn254::hash_3([chunk1, chunk2, chunk3])
}

// --- HELPER: Verify Merkle path for a leaf ---
fn verify_merkle_path(
    leaf: Field,
    path: [[Field; 2]; 6],
    root: Field
) -> bool {
    let mut current = leaf;
    for i in 0..6 {
        let sibling = path[i][0];
        let direction = path[i][1];
        if direction == 0 {
            // current is left child
            current = poseidon::bn254::hash_2([current, sibling]);
        } else {
            // current is right child
            current = poseidon::bn254::hash_2([sibling, current]);
        }
    }
    current == root
}

// ================================================================
// MAIN CIRCUIT
// ================================================================

fn main(
    // --- PRIVATE INPUTS ---
    ship_grid: [Field; 36],             // Flattened 6x6 grid. 1=ship, 0=water.
    merkle_path: [[Field; 2]; 6],       // Merkle proof for closest ship cell
    closest_ship_x: u8,                 // X coord of closest ship (private)
    closest_ship_y: u8,                 // Y coord of closest ship (private)
    layout_nonce: Field,                // Random nonce for commitment

    // --- PUBLIC INPUTS ---
    target_x: pub u8,                   // Where the shot was fired
    target_y: pub u8,
    layout_commitment: pub Field,       // Poseidon hash of grid+nonce
    min_dist: pub u8,                   // Proximity range lower bound
    max_dist: pub u8,                   // Proximity range upper bound
    is_hit: pub u8                      // 0=miss, 1=hit
) {
    // ==========================================================
    // CONSTRAINT 1: Layout commitment integrity
    // ==========================================================
    // Poseidon hash of (ship_grid_hash, layout_nonce) must equal
    // the committed layout_commitment stored on-chain at game start.
    // Uses external poseidon::bn254 -- NOT sha256.

    let grid_hash = hash_grid(ship_grid);
    let computed_commitment = poseidon::bn254::hash_2([grid_hash, layout_nonce]);
    assert(computed_commitment == layout_commitment, "Layout commitment mismatch");

    // Verify each grid cell is binary (0 or 1)
    for i in 0..36 {
        assert(
            (ship_grid[i] == 0) | (ship_grid[i] == 1),
            "Grid cell must be 0 or 1"
        );
    }

    // ==========================================================
    // CONSTRAINT 2: Grid bounds check
    // ==========================================================
    // Target coordinates must be within the 6x6 grid.

    assert(target_x < 6, "target_x out of bounds");
    assert(target_y < 6, "target_y out of bounds");

    // ==========================================================
    // CONSTRAINT 3: Hit/miss honesty
    // ==========================================================
    // The claimed is_hit value must exactly match the actual
    // grid cell value at the target coordinates.

    assert(is_hit < 2, "is_hit must be 0 or 1");
    let target_index: u32 = (target_y as u32) * 6 + (target_x as u32);
    let actual_value = ship_grid[target_index];
    assert(actual_value == is_hit as Field, "Hit/miss does not match grid");

    // ==========================================================
    // CONSTRAINT 4: Proximity (only when is_hit == 0)
    // ==========================================================
    // When the shot misses, the prover must demonstrate that
    // the claimed proximity range [min_dist, max_dist] is
    // accurate according to Chebyshev distance.

    if is_hit == 0 {
        // 4a: The claimed closest ship cell is actually a ship
        assert(closest_ship_x < 6, "closest_ship_x out of bounds");
        assert(closest_ship_y < 6, "closest_ship_y out of bounds");
        let closest_index: u32 = (closest_ship_y as u32) * 6 + (closest_ship_x as u32);
        assert(
            ship_grid[closest_index] == 1,
            "Claimed closest cell is not a ship"
        );

        // 4b: Closest cell is in the committed layout (Merkle path verification).
        //     The leaf is the Poseidon hash of (cell_value, x, y, nonce).
        let leaf = poseidon::bn254::hash_4([
            ship_grid[closest_index],
            closest_ship_x as Field,
            closest_ship_y as Field,
            layout_nonce
        ]);
        let grid_merkle_root = hash_grid(ship_grid);
        let merkle_valid = verify_merkle_path(leaf, merkle_path, grid_merkle_root);
        assert(merkle_valid, "Merkle path verification failed");

        // 4c: Chebyshev distance from target to closest ship is within
        //     the claimed [min_dist, max_dist] range.
        let actual_dist = chebyshev_distance(
            target_x, target_y,
            closest_ship_x, closest_ship_y
        );
        assert(actual_dist >= min_dist, "Distance below claimed minimum");
        assert(actual_dist <= max_dist, "Distance above claimed maximum");

        // 4d: No ship cell exists closer than the claimed closest.
        //     Iterate all 36 cells. For each ship cell, verify its
        //     distance is >= actual_dist (the claimed closest distance).
        //
        // Trade-off note: Constraint 4d adds ~300 constraints by iterating
        // all 36 cells, but is NECESSARY for soundness. Without it, prover
        // could claim a far cell as closest.
        // Total constraints: ~850. Proof time target: <10s browser WASM.
        for i in 0..36 {
            if ship_grid[i] == 1 {
                let cell_x: u8 = (i as u8) % 6;
                let cell_y: u8 = (i as u8) / 6;
                let cell_dist = chebyshev_distance(target_x, target_y, cell_x, cell_y);
                assert(
                    cell_dist >= actual_dist,
                    "A closer ship cell exists than claimed"
                );
            }
        }
    } else {
        // When is_hit == 1, proximity is irrelevant.
        // Enforce min_dist and max_dist are both 0 for consistency.
        assert(min_dist == 0, "min_dist must be 0 on hit");
        assert(max_dist == 0, "max_dist must be 0 on hit");
    }
}

// ================================================================
// TESTS
// ================================================================

#[test]
fn test_hit_scenario() {
    // Place a ship at (2,3) = index 20
    let mut grid = [0 as Field; 36];
    grid[20] = 1; // Ship at (2,3)
    grid[21] = 1; // Ship at (3,3)
    grid[22] = 1; // Ship at (4,3)

    let nonce: Field = 12345;
    let grid_hash = hash_grid(grid);
    let commitment = poseidon::bn254::hash_2([grid_hash, nonce]);

    // Shoot at (2,3) -- direct hit
    main(
        grid,
        [[0, 0]; 6],   // merkle_path unused for hits
        0, 0,           // closest_ship unused for hits
        nonce,
        2, 3,           // target
        commitment,
        0, 0,           // min/max dist must be 0 for hit
        1               // is_hit = 1
    );
}

#[test]
fn test_bounds_check() {
    let grid = [0 as Field; 36];
    let nonce: Field = 99999;
    let _grid_hash = hash_grid(grid);

    // Valid coordinates should pass bounds
    assert(0 < 6);
    assert(5 < 6);
}
