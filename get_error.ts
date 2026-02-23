import * as StellarSdk from '@stellar/stellar-sdk';
const rpc = new StellarSdk.rpc.Server('https://soroban-testnet.stellar.org');
async function run() {
    const res = await rpc.getTransaction('74b06c0db740208fba0d7ed1ad317b43965f70b1ae6f3c4ddf951c76fdfe2db0');
    console.log(JSON.stringify(res, null, 2));
}
run();
