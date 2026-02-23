import { Contract, rpc, TransactionBuilder, Networks, nativeToScVal } from '@stellar/stellar-sdk';
import fetch from 'node-fetch';

(globalThis as any).fetch = fetch;

async function main() {
    const server = new rpc.Server('https://soroban-testnet.stellar.org');
    const contractId = 'CDDXFNXH4IYOD3P4VF6HLLRZMHSAZA6D7JKD2LFNSGNCMZW2PMJNSLZM';
    const callerAddress = 'GDBS2DGJJOLBWFAWO6SBEXEHSI63HWMGJS6MNVFEQNMXTYQ4XB4BDOEF';

    const contract = new Contract(contractId);

    console.log('Fetching tx...');
    const result = await server.getTransaction('b89e7bd109ea1562e69b95bd1efbf1d6550dea9f6e9893b79d6ba54edf43a968');

    if (result.status === 'FAILED') {
        console.log(JSON.stringify(result, null, 2));
    }
}

main().catch(console.error);
