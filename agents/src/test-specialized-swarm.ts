import { Drone } from './drone.js';
import { Rover } from './rover.js';

async function runSpecializedSwarm() {
  console.log("🚀 STARTING SPECIALIZED SWARM TEST...");

  // 1. Spawn a Drone (The Relay)
  const relayDrone = new Drone(1883);
  
  // 2. Spawn two Rovers (The Ground Units)
  const roverA = new Rover(1883);
  const roverB = new Rover(1883);

  // 3. Move Rovers to opposite corners
  console.log("📍 Positioning Rovers at opposite ends...");
  
  // Nudge Rover A to (2, 2, 0)
  (roverA as any).physicalPos = { x: 2, y: 2, z: 0 };
  (roverA as any).state.pos = { x: 2, y: 2, z: 0 }; // Sync the heartbeat!
  
  // Nudge Rover B to (18, 18, 0)
  (roverB as any).physicalPos = { x: 18, y: 18, z: 0 };
  (roverB as any).state.pos = { x: 18, y: 18, z: 0 }; // Sync the heartbeat!

  console.log("👀 Watch the Drone (RELAY MODE) calculate the midpoint (10, 10, 0)...");
  
  // Keep alive and occasionally move rovers to see the drone follow
  let toggle = true;
  setInterval(() => {
    if (toggle) {
        (roverA as any).physicalPos = { x: 5, y: 5, z: 0 };
        (roverA as any).state.pos = { x: 5, y: 5, z: 0 };
    } else {
        (roverA as any).physicalPos = { x: 2, y: 2, z: 0 };
        (roverA as any).state.pos = { x: 2, y: 2, z: 0 };
    }
    toggle = !toggle;
    console.log(`--- ROVER A MOVED TO (${(roverA as any).physicalPos.x}, ${(roverA as any).physicalPos.y}, 0) ---`);
    
    // Trigger a harvest event from both rovers to test AI Aggregation
    roverA.harvestThreat(10, 10, 0);
    roverB.harvestThreat(10.2, 9.8, 0); // Slightly different but rounds to (10,10)
  }, 10000);
}

runSpecializedSwarm().catch(console.error);
