import { Rover } from './rover.js';
import { AIAgent } from './ai-agent.js';
import { Drone } from './drone.js';

const THREATS = [
  { x: 10, y: 10, z: 0 },
  { x: 5,  y: 15, z: 0 },
  { x: 18, y: 5,  z: 0 },
  { x: 3,  y: 3,  z: 0 },
  { x: 15, y: 15, z: 0 },
];

async function runSwarm() {
    console.log("=== BAYMAX SWARM — CONTINUOUS SIMULATION ===");
    console.log("Press Ctrl+C to stop.\n");

    // Spawn agents
    const ai   = new AIAgent();
    const roverA = new Rover();
    const roverB = new Rover();
    const roverC = new Rover();

    // Set starting positions
    const configs = [
      { agent: roverA, x: 2,  y: 2,  battery: 95 },
      { agent: roverB, x: 18, y: 18, battery: 40 },
      { agent: roverC, x: 2,  y: 18, battery: 75 },
    ];

    configs.forEach(({ agent, x, y, battery }) => {
        (agent as any).physicalPos = { x, y, z: 0 };
        (agent as any).state.pos   = { x, y, z: 0 };
        (agent as any).state.battery = battery;
    });

    console.log(`[SWARM] 🚀 Launched 1 AI Agent + 3 Rovers`);
    console.log(`[SWARM] 🌐 P2P Mesh active on FoxMQ :1883`);
    console.log(`[SWARM] 📊 Dashboard should connect on :9001\n`);

    // Wait for all agents to connect and discover each other
    await new Promise(r => setTimeout(r, 3000));

    let threatIndex = 0;

    // CONTINUOUS threat loop — triggers a new threat every 20 seconds
    const triggerThreat = () => {
        const threat = THREATS[threatIndex % THREATS.length];
        if (!threat) return;
        threatIndex++;

        console.log(`\n[Test] ═══════════════════════════════════════`);
        console.log(`[Test] 🎯 NEW THREAT #${threatIndex}: (${threat.x}, ${threat.y}, ${threat.z})`);
        console.log(`[Test] ═══════════════════════════════════════`);

        // Two rovers independently detect it (simulating distributed sensing)
        roverA.harvestThreat(threat.x,       threat.y,       threat.z);
        roverB.harvestThreat(threat.x + 0.1, threat.y - 0.1, threat.z);
    };

    // Fire immediately
    triggerThreat();

    // Repeat every 20 seconds  
    setInterval(triggerThreat, 20000);

    // Telemetry display
    setInterval(() => {
        const rs = [roverA, roverB, roverC];
        const status = rs.map(r => {
            const pos = (r as any).state.pos;
            const bat = (r as any).state.battery.toFixed(0);
            return `${r.id.slice(0,10)}: (${pos.x.toFixed(1)},${pos.y.toFixed(1)}) 🔋${bat}%`;
        }).join(' | ');
        console.log(`[Telemetry] ${status}`);
    }, 2000);
}

runSwarm();
