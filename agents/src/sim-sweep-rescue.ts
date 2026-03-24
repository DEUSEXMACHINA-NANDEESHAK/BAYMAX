/**
 * ═══════════════════════════════════════════════════════════════════
 * BAYMAX — SCENARIO 1: "SWEEP & RESCUE"
 * ═══════════════════════════════════════════════════════════════════
 *
 * HOW TO RUN:
 *   1. FoxMQ: .\foxmq.exe run -f foxmq.d\key_0.pem -L 0.0.0.0:1883 --websockets --websockets-addr 0.0.0.0:9001 foxmq.d
 *   2. Dashboard: npm run dev
 *   3. This: npm run sim-sweep
 *
 * WHAT HAPPENS:
 *   - 5 drones + 3 rovers spawn randomly.
 *   - After START, drones sweep upward at 1m/s.
 *   - 10Hz Telemetry: Dashboard sees fluid motion.
 *   - 2-drone consensus triggers a RETAINED threat marker.
 *   - Rovers bid and winner auto-intercepts.
 * ═══════════════════════════════════════════════════════════════════
 */

import { Drone } from './drone.js';
import { Rover } from './rover.js';
import mqtt from 'mqtt';

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function waitForMqtt(client: mqtt.MqttClient): Promise<void> {
  if (client.connected) return Promise.resolve();
  return new Promise(resolve => client.once('connect', () => resolve()));
}

function waitForStart(): Promise<void> {
  return new Promise((resolve) => {
    console.log('[SIM] 🎮 Awaiting START signal (Enter here or Button on Dashboard)...');
    const client = mqtt.connect('mqtt://localhost:1883', {
      clientId: 'sim-trigger', username: 'BAYMAX_SWARM', password: 'Baymax.Nand@k15'
    });
    client.on('connect', () => client.subscribe('swarm/sim/start'));
    client.on('message', (t) => { if (t === 'swarm/sim/start') { client.end(true); resolve(); } });
    process.stdin.resume();
    process.stdin.once('data', () => { client.end(true); resolve(); });
  });
}

// ── Main Simulation ──────────────────────────────────────────────────────────
async function main() {
  console.log('\n[SIM] 🚀 INITIALIZING SWEEP & RESCUE...');

  const COLS = [5, 15, 25, 35, 45] as const;
  const drones: Drone[] = [];
  const rovers: Rover[] = [];

  // Spawn Agents
  for (let i = 0; i < 5; i++) {
    const d = new Drone();
    d.simControlled = true;
    const col = COLS[i]!;
    d.physicalPos = { x: col + rand(-2, 2), y: rand(0, 4), z: rand(8, 12) };
    d.state.pos = { ...d.physicalPos };
    drones.push(d);
  }

  for (let i = 0; i < 3; i++) {
    const r = new Rover();
    r.physicalPos = { x: rand(3, 47), y: rand(1, 8), z: 0 };
    r.state.pos = { ...r.physicalPos };
    rovers.push(r);
  }

  const TARGET = { x: rand(18, 22), y: rand(28, 35) };
  console.log(`[SIM] 🎯 Hidden Target at (${TARGET.x.toFixed(1)}, ${TARGET.y.toFixed(1)})`);

  await sleep(4000); // Give them time to connect
  console.log('[SIM] ✅ Swarm ready. STARTING AUTOMATICALLY IN 3s...');
  await sleep(3000);

  // High-Frequency (20Hz) Telemetry Loop for Dashboard Animation
  const telemetryInterval = setInterval(() => {
    [...drones, ...rovers].forEach(a => a.publishState());
  }, 50);

  // await waitForStart(); // DISABLED: START button was the culprit!

  const pub = mqtt.connect('mqtt://localhost:1883', {
    clientId: 'sim-manager', username: 'BAYMAX_SWARM', password: 'Baymax.Nand@k15'
  });
  await waitForMqtt(pub);

  console.log('\n[SWEEP] 🔄 COMMENCING GRID SWEEP...');
  const detectedBy: string[] = [];
  let missionFired = false;

  for (let y = 0; y <= 60; y += 0.5) {
    // 1. Move Drones - Sweep + Sine Wave in X for extreme visibility
    drones.forEach((d, i) => {
      const col = COLS[i]!;
      const sweepX = col + Math.sin(y * 0.5 + i) * 5; 
      d.physicalPos = { x: sweepX, y, z: 10 + Math.sin(y * 0.2) * 2 };
      d.state.pos = { ...d.physicalPos };
    });

    if (Math.floor(y) % 5 === 0 && y === Math.floor(y)) {
      console.log(`[SWEEP] 📡 Scanning row y=${y}m...`);
    }

    // 2. Detection Logic
    drones.forEach(d => {
      const dist = Math.sqrt(Math.pow(d.state.pos.x - TARGET.x, 2) + Math.pow(d.state.pos.y - TARGET.y, 2));
      if (dist < 8 && !detectedBy.includes(d.id)) {
        detectedBy.push(d.id);
        console.log(`[SWEEP] 🔍 ${d.id} DETECTED target! (${detectedBy.length}/2)`);

        if (detectedBy.length >= 2 && !missionFired) {
          missionFired = true;
          console.log('\n[DETECT] 🎯 CONSENSUS REACHED! PUBLISHING THREAT...');
          
          // Publish with RETAIN so dashboard sees it even if it refreshes
          pub.publish('swarm/task/verified', JSON.stringify({
            taskId: 'sweep-target-alpha',
            pos: { x: Math.round(TARGET.x), y: Math.round(TARGET.y), z: 0 },
            type: 'INTERCEPT'
          }), { retain: true });
        }
      }
    });

    // 3. Keep Target Visible (Heartbeat for target marker)
    if (missionFired && Math.floor(y * 2) % 4 === 0) {
        pub.publish('swarm/task/verified', JSON.stringify({
            taskId: 'sweep-target-alpha',
            pos: { x: Math.round(TARGET.x), y: Math.round(TARGET.y), z: 0 },
            type: 'INTERCEPT'
        }));
    }

    await sleep(200); // 0.5m every 200ms = 2.5m/s sweep speed
  }

  console.log('\n[SIM] 🏁 Sweep complete. Rovers are intercepting.');
  console.log('[SIM] 📌 Keeping process alive for visualization. Ctrl+C to stop.');
  
  // Final safeguard: keep publishing state for rovers moving to target
  await sleep(1000000);
}

main().catch(console.error);
