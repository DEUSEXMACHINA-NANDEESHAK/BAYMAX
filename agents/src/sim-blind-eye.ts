/**
 * ═══════════════════════════════════════════════════════════════════
 * BAYMAX — SCENARIO 3: "BLIND EYE"
 * ═══════════════════════════════════════════════════════════════════
 *
 * HOW TO RUN:
 *   Terminal 3: npm run sim-blindeye
 *
 * WHAT HAPPENS:
 *   - 4 drones + 2 rovers sweep.
 *   - After y=10, Drone B's GPS is SPOOFED (position frozen).
 *   - Remaining drones detect target at (25, 40) → consensus → auction.
 *   - Spoofed drone is excluded by TaskEngine due to CTM.
 * ═══════════════════════════════════════════════════════════════════
 */

import { Drone } from './drone.js';
import { Rover } from './rover.js';
import mqtt from 'mqtt';

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
      clientId: `sim-trigger-${Math.random().toString(16).slice(2, 6)}`,
      username: 'BAYMAX_SWARM',
      password: 'Baymax.Nand@k15'
    });
    client.on('connect', () => client.subscribe('swarm/sim/start'));
    client.on('message', (t) => { if (t === 'swarm/sim/start') { client.end(true); resolve(); } });
    process.stdin.resume();
    process.stdin.once('data', () => { client.end(true); resolve(); });
  });
}


async function main() {
  console.log('\n[BLINDEYE] 💀 INITIALIZING BLIND EYE SCENARIO...');

  const COLS = [8, 18, 32, 42] as const;
  const drones: Drone[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Drone();
    d.simControlled = true;
    const col = COLS[i]!;
    d.physicalPos = { x: col, y: rand(0, 3), z: rand(8, 12) };
    d.state.pos = { ...d.physicalPos };
    drones.push(d);
  }

  const roverA = new Rover();
  const roverB = new Rover();
  roverA.physicalPos = { x: rand(5, 15), y: rand(1, 5), z: 0 };
  roverA.state.pos = { ...roverA.physicalPos };
  roverB.physicalPos = { x: rand(30, 40), y: rand(1, 5), z: 0 };
  roverB.state.pos = { ...roverB.physicalPos };

  const TARGET = { x: 25, y: 40, z: 0 };
  const agents = [...drones, roverA, roverB];

  await sleep(4000);
  console.log('[SIM] ✅ Swarm ready. STARTING IN 3s...');
  await sleep(3000);

  // High-Frequency (20Hz) Telemetry
  setInterval(() => agents.forEach(a => a.publishState()), 50);

  // await waitForStart(); // DISABLED 🎮: START button was the culprit!
  const pub = mqtt.connect('mqtt://localhost:1883', {
    clientId: 'sim-blindeye-pub', username: 'BAYMAX_SWARM', password: 'Baymax.Nand@k15'
  });
  await waitForMqtt(pub);

  console.log('[BLINDEYE] 🔄 SWEEP COMMENCING...');
  const detected: string[] = [];
  const spoofDrone = drones[1]!;
  let spoofed = false;

  for (let y = 0; y <= 60; y += 0.5) {
    for (let i = 0; i < drones.length; i++) {
      const drone = drones[i];
      if (!drone) continue;
      if (spoofed && drone.id === spoofDrone.id) continue; // Frozen GPS!
      const col = COLS[i]!;
      const wobble = Math.sin(y * 0.5 + i) * 5; 
      drone.physicalPos = { x: col + wobble, y, z: 10 + Math.sin(y * 0.3) * 2 };
      drone.state.pos = { ...drone.physicalPos };
    }

    if (y === 10 && !spoofed) {
      spoofed = true;
      console.log(`\n[BLINDEYE] 💀 GPS SPOOFED on ${spoofDrone.id} — Position Frozen!`);
      pub.publish('swarm/sim/inject/fail', JSON.stringify({ id: spoofDrone.id, system: 'gps' }));
    }

    // Detection (consensus excluding spoofed drone)
    for (const drone of drones) {
      if (spoofed && drone.id === spoofDrone.id) continue;
      const dist = Math.sqrt(Math.pow(drone.state.pos.x - TARGET.x, 2) + Math.pow(drone.state.pos.y - TARGET.y, 2));
      if (dist < 8 && !detected.includes(drone.id)) {
        detected.push(drone.id);
        if (detected.length >= 2) {
          console.log('\n[DETECT] 🎯 2-DRONE CONSENSUS ACHIEVED!');
          pub.publish('swarm/task/verified', JSON.stringify({
            taskId: 'blindeye-target-alpha', pos: TARGET, type: 'INTERCEPT'
          }), { retain: true });
        }
      }
    }
    await sleep(200);
  }

  console.log('[SIM] ✅ Scenario concluded. Process keeping alive.');
  setInterval(() => {}, 100000);
}

main().catch(console.error);
