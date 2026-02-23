import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import fs from 'fs';
import path from 'path';

async function main() {
    const circuitPath = path.resolve('circuits/phantom_fleet/target/phantom_fleet.json');
    if (!fs.existsSync(circuitPath)) {
        console.error('❌ Error: Compile the circuit first using `nargo compile`');
        process.exit(1);
    }

    console.log('▶ Loading circuit artifact...');
    const circuit = JSON.parse(fs.readFileSync(circuitPath, 'utf8'));

    console.log('▶ Initializing Barretenberg backend...');
    const backend = new BarretenbergBackend(circuit);

    console.log('▶ Extracting Verification Key...');
    const vkBytes = await backend.getVerificationKey();

    // The returned VK is a Uint8Array. Convert to hex string for Soroban.
    const vkHex = Buffer.from(vkBytes).toString('hex');

    console.log(`\n✅ VK Extracted (${vkHex.length} chars)`);
    console.log(`\nexport VK_HEX=${vkHex}`);

    fs.writeFileSync('circuits/phantom_fleet/target/vk.hex', vkHex);
    console.log('\n✅ VK saved to circuits/phantom_fleet/target/vk.hex');

    await backend.destroy();
}

main().catch(console.error);
