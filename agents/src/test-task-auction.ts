import { Rover } from './rover.js';
import { AIAgent } from './ai-agent.js';

async function testAuction() {
    console.log("--- 🏛️  SUB-500ms AUCTION TEST START ---");
    
    const ai = new AIAgent();
    const roverA = new Rover();
    const roverB = new Rover();

    // Force different starting positions for the rovers
    (roverA as any).physicalPos = { x: 2, y: 2, z: 0 };
    (roverA as any).state.pos = { x: 2, y: 2, z: 0 };
    (roverA as any).state.battery = 95;

    (roverB as any).physicalPos = { x: 18, y: 18, z: 0 };
    (roverB as any).state.pos = { x: 18, y: 18, z: 0 };
    (roverB as any).state.battery = 40; // Low battery = Much higher cost

    console.log(`[Test] Rover A at (2,2) Battery 95%`);
    console.log(`[Test] Rover B at (18,18) Battery 40%`);

    // Telemetry loop
    const telemetry = setInterval(() => {
        const distA = Math.sqrt(Math.pow(10 - (roverA as any).state.pos.x, 2) + Math.pow(10 - (roverA as any).state.pos.y, 2));
        const distB = Math.sqrt(Math.pow(10 - (roverB as any).state.pos.x, 2) + Math.pow(10 - (roverB as any).state.pos.y, 2));
        console.log(`[Telemetry] Dist to (10,10) | RoverA: ${distA.toFixed(1)}m | RoverB: ${distB.toFixed(1)}m`);
    }, 1000);

    // Give them a moment to discover each other
    setTimeout(() => {
        console.log("\n[Test] 🎯 Triggering Threat at (10, 10, 0)...");
        // Rover A is closer and has more battery. It SHOULD win.
        roverA.harvestThreat(10, 10, 0); 
        roverB.harvestThreat(10.1, 9.9, 0); // Both detect it
    }, 2000);

    // End test after 15s (to allow for movement)
    setTimeout(() => {
        clearInterval(telemetry);
        console.log("\n--- TEST COMPLETE ---");
        process.exit(0);
    }, 15000);
}

testAuction();
