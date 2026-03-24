/**
 * ═══════════════════════════════════════════════════════════════════
 * BAYMAX — SCENARIO 2: "DEAD RELAY"
 * ═══════════════════════════════════════════════════════════════════
 *
 * HOW TO RUN:
 *   1. FoxMQ: .\foxmq.exe run -f foxmq.d\key_0.pem -L 0.0.0.0:1883 --websockets --websockets-addr 0.0.0.0:9001 foxmq.d
 *   2. Dashboard: npm run dev
 *   3. This: npm run sim-relay
 *
 * WHAT HAPPENS:
 *   - 2 drones + 3 rovers spawn.
 *   - After START, a target at (40, 40) is published.
 *   - Closest rover (Rover A) wins the auction.
 *   - After 8s, GPS FAILURE is injected into Rover A (frozen position).
 *   - Target re-published after 5s → Rover B wins the re-auction.
 *   - 10Hz Telemetry: Smooth dashboard movement.
 * ═══════════════════════════════════════════════════════════════════
 */

import { Drone } from './drone.js';
import { Rover } from './rover.js';
import mqtt from 'mqtt';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

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
  console.log('\n[RELAY] ⚡ INITIALIZING DEAD RELAY SCENARIO...');

  const droneA = new Drone(); droneA.simControlled = true;
  const droneB = new Drone(); droneB.simControlled = true;
  droneA.physicalPos = { x: 20, y: 20, z: 10 }; droneA.state.pos = { ...droneA.physicalPos };
  droneB.physicalPos = { x: 30, y: 20, z: 10 }; droneB.state.pos = { ...droneB.physicalPos };

  const roverA = new Rover(); // Closest to (40, 40)
  const roverB = new Rover(); // Secondary
  const roverC = new Rover(); // Far
  roverA.physicalPos = { x: 30, y: 30, z: 0 }; roverA.state.pos = { ...roverA.physicalPos };
  roverB.physicalPos = { x: 10, y: 10, z: 0 }; roverB.state.pos = { ...roverB.physicalPos };
  roverC.physicalPos = { x: 5,  y: 5,  z: 0 }; roverC.state.pos = { ...roverC.physicalPos };

  const TARGET = { x: 40, y: 40, z: 0 };
  const agents = [droneA, droneB, roverA, roverB, roverC];

  await sleep(4000);
  console.log('[SIM] ✅ Swarm ready. STARTING IN 3s...');
  await sleep(3000);

  // High-Frequency (20Hz) Telemetry
  setInterval(() => agents.forEach(a => a.publishState()), 50);

  // await waitForStart(); // DISABLED: START button was the culprit!

  const pub = mqtt.connect('mqtt://localhost:1883', {
    clientId: 'sim-relay-pub', username: 'BAYMAX_SWARM', password: 'Baymax.Nand@k15'
  });
  await waitForMqtt(pub);

  console.log('[RELAY] 🎯 Target Detected at (40, 40) — Auction Fired!');
  pub.publish('swarm/task/verified', JSON.stringify({
    taskId: 'dead-relay-target-1', pos: TARGET, type: 'INTERCEPT'
  }), { retain: true });

  await sleep(8000);
  console.log(`\n[RELAY] ⚡ INJECTING GPS FAILURE into ${roverA.id}...`);
  pub.publish('swarm/sim/inject/fail', JSON.stringify({ id: roverA.id, system: 'gps' }));

  await sleep(5000);
  console.log('[RELAY] 📢 Re-auctioning mission...');
  pub.publish('swarm/task/verified', JSON.stringify({
    taskId: 'dead-relay-retry-1', pos: TARGET, type: 'INTERCEPT'
  }));

  console.log('[RELAY] ✅ Mission handed over. Process keeping alive.');
  setInterval(() => {}, 100000);
}

main().catch(console.error);
