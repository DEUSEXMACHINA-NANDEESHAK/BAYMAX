/**
 * ═══════════════════════════════════════════════════════════════════
 * BAYMAX — ULTIMATE CONSOLIDATED SCENARIO
 * ═══════════════════════════════════════════════════════════════════
 * ⚔️ Goal: 90s comprehensive demo of Sweep, Consensus, and Intercept.
 * 🛠️ Manual Interventions: Kill a drone or spoof GPS while it runs!
 * ═══════════════════════════════════════════════════════════════════
 */

import { Drone } from './drone.js';
import { Rover } from './rover.js';
import mqtt from 'mqtt';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

async function main() {
  console.log('\n[ULTIMATE] 🚀 INITIALIZING CONSOLIDATED MISSION...');

  const COLS = [5, 15, 25, 35, 45] as const;
  const drones: Drone[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Drone();
    d.simControlled = true;
    const col = COLS[i]!;
    d.physicalPos = { x: col, y: rand(0, 5), z: 10 + rand(-1, 1) };
    d.state.pos = { ...d.physicalPos };
    drones.push(d);
  }

  const rovers: Rover[] = [];
  for (let i = 0; i < 3; i++) {
    const r = new Rover();
    r.physicalPos = { x: 5 + i * 15, y: rand(0, 5), z: 0 };
    r.state.pos = { ...r.physicalPos };
    rovers.push(r);
  }

  const TARGETS = [
    { id: 'ALPHA', x: 12, y: 48, z: 0 },
    { id: 'BETA',  x: 38, y: 55, z: 0 }
  ];

  const agents = [...drones, ...rovers];
  const pub = mqtt.connect('mqtt://localhost:1883', {
    clientId: 'sim-ultimate-manager', username: 'BAYMAX_SWARM', password: 'Baymax.Nand@k15'
  });

  // 1. Initial Countdown (Synced to Dashboard)
  for (let i = 10; i > 0; i--) {
    console.log(`[SIM] ⏳ Launch in ${i}s...`);
    pub.publish('swarm/sim/status', JSON.stringify({ timer: i, message: 'Swarm Ignition' }));
    await sleep(1000);
  }
  pub.publish('swarm/sim/status', JSON.stringify({ timer: 0, message: 'Mission Active' }));

  // 2. High-Frequency Telemetry Loop (20Hz)
  setInterval(() => {
    agents.forEach(a => a.publishState());
  }, 50);

  console.log('[SIM] 🏁 MISSION START — COMMENCING SWEEP');
  const detected: string[] = [];

  // 3. Main Logic Loop (Sweep)
  // Total distance 60m. Step 0.25m every 500ms = 0.5m/s -> 120s total duration.
  for (let y = 0; y <= 60; y += 0.25) {
    // A. Move Drones (Slow Sweep)
    drones.forEach((d, i) => {
      if (d.isFrozen) return;
      const col = COLS[i]!;
      const wobble = Math.sin(y * 0.4 + i) * 3;
      d.physicalPos = { x: col + wobble, y, z: 10 + Math.sin(y * 0.2) * 2 };
      d.state.pos = { ...d.physicalPos };
    });

    // B. Check for Targets
    for (const target of TARGETS) {
      for (const drone of drones) {
        if (drone.isFrozen || drone.state.health !== 'FULL') continue;

        const dist = Math.sqrt(Math.pow(drone.state.pos.x - target.x, 2) + Math.pow(drone.state.pos.y - target.y, 2));
        const key = `${drone.id}-${target.id}`;

        if (dist < 8 && !detected.includes(key)) {
          detected.push(key);
          const totalHits = detected.filter(k => k.endsWith(target.id)).length;
          
          if (totalHits >= 2) {
            console.log(`\n[DETECT] 🎯 TARGET ${target.id} VERIFIED via Consensus!`);
            pub.publish('swarm/task/verified', JSON.stringify({
              taskId: `capture-${target.id}-${Date.now().toString().slice(-4)}`,
              pos: { x: target.x, y: target.y, z: target.z },
              type: 'INTERCEPT'
            }), { retain: true });
          }
        }
      }
    }

    await sleep(250); // Move every 250ms -> 0.25m per 0.25s = 1m/s. 60 units = 60s.
  }

  console.log('[SIM] ✅ Scenario concluded. Staying alive for telemetry...');
  setInterval(() => {}, 100000);
}

main().catch(console.error);
