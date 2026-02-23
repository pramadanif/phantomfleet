pragma circom 2.1.8;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

template PhantomFleet() {
    signal input ship_grid[36];
    signal input layout_nonce;

    signal input layout_commitment;
    signal input target_x;
    signal input target_y;
    signal input min_dist;
    signal input max_dist;
    signal input is_hit;

    var i;

    component txBound = LessThan(3);
    txBound.in[0] <== target_x;
    txBound.in[1] <== 6;
    txBound.out === 1;

    component tyBound = LessThan(3);
    tyBound.in[0] <== target_y;
    tyBound.in[1] <== 6;
    tyBound.out === 1;

    component chunk1 = Poseidon(15);
    component chunk2 = Poseidon(15);
    component chunk3 = Poseidon(7);

    for (i = 0; i < 15; i++) {
        chunk1.inputs[i] <== ship_grid[i];
        chunk2.inputs[i] <== ship_grid[15 + i];
    }

    for (i = 0; i < 6; i++) {
        chunk3.inputs[i] <== ship_grid[30 + i];
    }
    chunk3.inputs[6] <== 0;

    component gridHash = Poseidon(3);
    gridHash.inputs[0] <== chunk1.out;
    gridHash.inputs[1] <== chunk2.out;
    gridHash.inputs[2] <== chunk3.out;

    component commitment = Poseidon(2);
    commitment.inputs[0] <== gridHash.out;
    commitment.inputs[1] <== layout_nonce;
    commitment.out === layout_commitment;

    signal target_index;
    target_index <== target_y * 6 + target_x;

    component eqIdx[36];

    signal ship_prefix[37];
    ship_prefix[0] <== 0;

    signal target_prefix[37];
    target_prefix[0] <== 0;

    for (i = 0; i < 36; i++) {
        ship_grid[i] * (ship_grid[i] - 1) === 0;

        eqIdx[i] = IsEqual();
        eqIdx[i].in[0] <== target_index;
        eqIdx[i].in[1] <== i;

        ship_prefix[i + 1] <== ship_prefix[i] + ship_grid[i];
        target_prefix[i + 1] <== target_prefix[i] + eqIdx[i].out * ship_grid[i];
    }

    signal ship_sum;
    ship_sum <== ship_prefix[36];

    component hasShip = LessThan(7);
    hasShip.in[0] <== 0;
    hasShip.in[1] <== ship_sum;
    hasShip.out === 1;

    signal target_cell;
    target_cell <== target_prefix[36];

    target_cell === is_hit;

    signal is_miss;
    is_miss <== 1 - is_hit;

    component minBound = LessThan(4);
    minBound.in[0] <== min_dist;
    minBound.in[1] <== 9;

    component maxBound = LessThan(4);
    maxBound.in[0] <== max_dist;
    maxBound.in[1] <== 9;

    component minLeMax = LessThan(4);
    minLeMax.in[0] <== min_dist;
    minLeMax.in[1] <== max_dist + 1;

    is_miss * (1 - minBound.out) === 0;
    is_miss * (1 - maxBound.out) === 0;
    is_miss * (1 - minLeMax.out) === 0;

    is_hit * min_dist === 0;
    is_hit * max_dist === 0;
}

component main { public [layout_commitment, target_x, target_y, min_dist, max_dist, is_hit] } = PhantomFleet();
