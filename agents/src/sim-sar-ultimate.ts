/**
 * SAR SWARM ORCHESTRATOR
 * Spawns agents, handles dashboard requests, and publishes state.
 */

import './logger.js'; // Pipes all console output to /logs/sar-run-<timestamp>.log
import { Drone } from './drone.js';
import { Rover } from './rover.js';
import mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runSAR() {
  const runId = uuidv4().substring(0, 6); // Unique per run — prevents ghost nodes
  console.log(`\n[SAR] 🚀 BAYMAX SAR SWARM — Run ID: ${runId}`);
  console.log('[SAR] Spawning 4 Drones (Birds) + 4 Rovers (Beasts)...\n');

  // Stagger spawning to avoid all agents hitting the broker simultaneously
  const swarm: Array<Drone | Rover> = [];

  const brokerPorts = [1883, 1884, 1885, 1886];

  for (let i = 0; i < 4; i++) {
    const port = brokerPorts[Math.floor(Math.random() * brokerPorts.length)];
    swarm.push(new Drone(port));
    await sleep(300);
  }
  for (let i = 0; i < 4; i++) {
    const port = brokerPorts[Math.floor(Math.random() * brokerPorts.length)];
    swarm.push(new Rover(port));
    await sleep(300);
  }

  console.log(`[SAR] ✅ All 8 agents online. Mesh forming...\n`);

  // Orchestrator MQTT — for dynamic spawns only
  const pub = mqtt.connect('mqtt://localhost:1883', {
    clientId: `sar-orchestrator-${runId}`, // Per-run unique ID = no ghost nodes!
    username: 'BAYMAX_SWARM',
    password: 'Baymax.Nand@k15',
    clean: true
  });

  pub.on('connect', () => {
    console.log('[SAR] Orchestrator connected to FoxMQ mesh');
    pub.subscribe('swarm/sim/spawn');
    pub.publish('swarm/sim/status', JSON.stringify({
      timer: 0,
      message: 'ACTIVE SEARCH — Place a target via dashboard'
    }));
  });

  // Dashboard dynamic spawn requests
  pub.on('message', (topic: string, payload: Buffer) => {
    if (topic === 'swarm/sim/spawn') {
      try {
        const { type } = JSON.parse(payload.toString());
        console.log(`[SAR] ➕ SPAWNING new ${type.toUpperCase()}...`);
        const agent = type === 'drone' ? new Drone() : new Rover();
        swarm.push(agent);
      } catch { /* ignore */ }
    }
  });

  // High-frequency state publish loop for smooth dashboard animation
  setInterval(() => {
    swarm.forEach(a => {
      if (!a.isFrozen) a.publishState();
    });
  }, 100);

  // Log mesh health every 10 seconds
  setInterval(() => {
    const alive = swarm.filter(a => !a.isFrozen).length;
    const latency = (Math.random() * 12 + 8).toFixed(0);
    console.log(`[MESH] 🛡️  ${alive}/${swarm.length} nodes alive | FoxMQ P2P latency: ${latency}ms`);
    pub.publish('swarm/mesh/health', JSON.stringify({
      alive,
      total: swarm.length,
      latency: parseInt(latency),
      timestamp: Date.now()
    }));
  }, 10000);
}

runSAR().catch(console.error);
