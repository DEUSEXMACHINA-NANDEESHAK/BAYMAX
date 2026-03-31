import aedes from 'aedes';
import { createServer } from 'http';
import net from 'net';
// @ts-ignore
import ws from 'websocket-stream';
import express from 'express';
import cors from 'cors';
import { Drone } from './drone.js';
import { Rover } from './rover.js';
import mqtt from 'mqtt';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const port = process.env.PORT || 4000;
const mqttPort = 1883;
const wsPort = 9001;

// 1. MQTT Broker (Aedes)
// @ts-ignore
const broker = (aedes.default || aedes)();
const httpServer = createServer(app);

// MQTT over WebSockets (for the dashboard)
(ws as any).createServer({ server: httpServer, path: '/mqtt' }, (broker as any).handle);

// 2. Swarm Orchestrator State
let swarm: Array<Drone | Rover> = [];
let isSimulationRunning = false;
let runId = '';
let publishInterval: NodeJS.Timeout | null = null;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function startSwarm() {
  if (isSimulationRunning) return;
  isSimulationRunning = true;
  runId = uuidv4().substring(0, 6);
  swarm = [];

  console.log(`[SAR SERVICE] 🚀 Starting Swarm — Run ID: ${runId}`);

  // Spawning 4 Drones + 4 Rovers
  for (let i = 0; i < 4; i++) {
    const agent = new Drone(mqttPort);
    swarm.push(agent);
    await sleep(300);
  }
  for (let i = 0; i < 4; i++) {
    const agent = new Rover(mqttPort);
    swarm.push(agent);
    await sleep(300);
  }

  // Orchestrator status publish
  const client = mqtt.connect(`mqtt://127.0.0.1:${mqttPort}`, {
    clientId: `orchestrator-${runId}`,
    username: 'BAYMAX_SWARM',
    password: 'Baymax.Nand@k15'
  });

  client.on('connect', () => {
    client.publish('swarm/sim/status', JSON.stringify({
      timer: 0,
      message: 'SIMULATION ACTIVE — Swarm deployed successfully'
    }), { retain: true });
  });

  // High-frequency state publish loop
  publishInterval = setInterval(() => {
    if (!isSimulationRunning) {
      if (publishInterval) clearInterval(publishInterval);
      return;
    }
    swarm.forEach(a => {
      if (!a.isFrozen) a.publishState();
    });
  }, 100);
}

// 3. REST Endpoints
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    simulation: isSimulationRunning ? 'running' : 'idle',
    agents: swarm.length,
    timestamp: new Date().toISOString()
  });
});

app.post('/api/sar/start', async (req, res) => {
  if (isSimulationRunning) {
    return res.json({ status: 'running', message: 'Simulation already active' });
  }

  // Start in background
  startSwarm().catch(err => console.error('[SAR SERVICE] Start error:', err));
  
  res.json({ 
    status: 'starting', 
    message: 'Deploying swarm agents (4 drones, 4 rovers)...' 
  });
});

app.post('/api/sar/stop', (req, res) => {
  isSimulationRunning = false;
  if (publishInterval) clearInterval(publishInterval);
  swarm.forEach(a => {
    try { a.client.end(); } catch (e) {}
  });
  swarm = [];
  res.json({ status: 'stopped', message: 'Simulation cleared' });
});

app.post('/api/sar/chaos', (req, res) => {
  const { action } = req.body;
  if (!isSimulationRunning || swarm.length === 0) {
    return res.status(400).json({ error: 'Simulation not running' });
  }

  // Randomly select an active agent
  const active = swarm.filter(a => !a.isFrozen);
  if (active.length === 0) return res.status(400).json({ error: 'No active agents' });
  const target = active[Math.floor(Math.random() * active.length)];

  if (action === 'fail-gps') {
    target.failSystem('gps');
  } else if (action === 'drain') {
    target.failSystem('battery_sensor');
  }

  res.json({ status: 'injected', target: target.id, action });
});

// 4. Start Central Server
const mqttServer = net.createServer(broker.handle);

mqttServer.listen(mqttPort, '0.0.0.0', () => {
  console.log(`[SAR SERVICE] 🤖 MQTT TCP Broker ready on port ${mqttPort}`);
});

httpServer.listen(Number(port), '0.0.0.0', () => {
  console.log(`[SAR SERVICE] ⚡ Server running on port ${port} (0.0.0.0)`);
  console.log(`[SAR SERVICE] 🛰️  MQTT/WS Broker ready on same port via /mqtt (for dashboard)`);
});
