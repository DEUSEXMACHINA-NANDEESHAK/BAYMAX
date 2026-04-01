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
const port = Number(process.env.PORT) || 4000;
const MQTT_PORTS = [1883, 1884, 1885, 1886];
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
let healthInterval: NodeJS.Timeout | null = null;
let orchestratorClient: mqtt.MqttClient | null = null;
const brokerServers: Map<number, net.Server> = new Map();
const deadPortsSet: Set<number> = new Set();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function startSwarm() {
  if (isSimulationRunning) return;
  isSimulationRunning = true;
  runId = uuidv4().substring(0, 6);
  swarm = [];

  console.log(`[SAR SERVICE] 🚀 Starting Swarm — Run ID: ${runId}`);

  // Spawning 4 Drones + 4 Rovers (Distributed across 4 nodes)
  for (let i = 0; i < 4; i++) {
    const port = MQTT_PORTS[Math.floor(Math.random() * MQTT_PORTS.length)];
    const agent = new Drone(port);
    swarm.push(agent);
    await sleep(300);
  }
  for (let i = 0; i < 4; i++) {
    const port = MQTT_PORTS[Math.floor(Math.random() * MQTT_PORTS.length)];
    const agent = new Rover(port);
    swarm.push(agent);
    await sleep(300);
  }

  // Orchestrator status publish (Anchored to port 1883)
  const client = mqtt.connect(`mqtt://127.0.0.1:1883`, {
    clientId: `orchestrator-${runId}`,
    username: 'BAYMAX_SWARM',
    password: 'Baymax.Nand@k15'
  });
  orchestratorClient = client;

  client.on('connect', () => {
    client.publish('swarm/sim/status', JSON.stringify({
      timer: 0,
      message: 'SIMULATION ACTIVE — Swarm deployed successfully'
    }), { retain: true });

    // Listen for tactical overrides from the mesh (e.g. Dashboard)
    client.subscribe(['swarm/sim/stop', 'swarm/sim/spawn']);
    console.log(`[SAR SERVICE] 🛰️  Orchestrator subscribed to tactical overrides`);
  });

  client.on('message', (topic, payload) => {
    const data = JSON.parse(payload.toString());
    
    if (topic === 'swarm/sim/stop') {
        console.log(`[SAR SERVICE] 🛑 Tactical STOP received from mesh`);
        stopSimulation();
    }

    if (topic === 'swarm/sim/spawn') {
        const type = data.type || 'drone';
        const port = MQTT_PORTS[Math.floor(Math.random() * MQTT_PORTS.length)];
        const agent = type === 'drone' ? new Drone(port) : new Rover(port);
        swarm.push(agent);
        console.log(`[SAR SERVICE] ➕ Tactical SPAWN: Received ${type.toUpperCase()} request on port ${port}`);
    }
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

  const broadcastMeshHealth = () => {
    let aliveCount = 0;
    const latencyStart = performance.now();
    for (const port of MQTT_PORTS) {
      if (brokerServers.get(port)) aliveCount++;
    }
    const latency = Math.round(performance.now() - latencyStart + (Math.random() * 5));
    if (orchestratorClient && orchestratorClient.connected) {
      orchestratorClient.publish('swarm/mesh/health', JSON.stringify({
        alive: aliveCount,
        total: MQTT_PORTS.length,
        latency: aliveCount > 0 ? latency : 999,
        deadPorts: Array.from(deadPortsSet),
        timestamp: Date.now()
      }));
    }
  };

  // START MESH HEALTH MONITORING (BFT Simulation)
  healthInterval = setInterval(() => {
    broadcastMeshHealth();
  }, 2000);
}

function stopSimulation() {
  isSimulationRunning = false;
  if (publishInterval) clearInterval(publishInterval);
  if (healthInterval) clearInterval(healthInterval);
  
  // Broadcast IDLE status to the mesh to clear all observers
  if (orchestratorClient) {
    orchestratorClient.publish('swarm/sim/status', JSON.stringify({
      simulation: 'idle',
      timer: 0,
      message: 'SIMULATION IDLE — READY FOR NEW MISSION'
    }), { retain: true });
    orchestratorClient.end();
    orchestratorClient = null;
  }

  swarm.forEach(a => {
    try { a.client.end(); } catch (e) {}
  });
  swarm = [];
  console.log(`[SAR SERVICE] 🏁 MISSION TERMINATED — System reset to idle`);
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
  stopSimulation();
  res.json({ status: 'stopped', message: 'Mission terminated and registry cleared' });
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
  } else if (action === 'fail-node') {
    // Determine the port of a random node to kill
    const livePorts = MQTT_PORTS.filter(p => brokerServers.has(p));
    if (livePorts.length === 0) return res.status(400).json({ error: 'No live nodes left' });
    const targetPort = livePorts[Math.floor(Math.random() * livePorts.length)];
    const server = brokerServers.get(targetPort);
    
    if (server) {
       console.log(`[SAR SERVICE] ☢️  CHAOS: Terminating node on port ${targetPort}`);
       server.close();
       brokerServers.delete(targetPort);
       deadPortsSet.add(targetPort);

       // INSTANTLY IMPACT AGENTS on this node for visualization
       swarm.forEach(a => {
         if (a.state.brokerPort === targetPort && a.state.health !== 'DEAD') {
            console.log(`[SAR SERVICE] 🚑 Node ${targetPort} DOWN — Agent ${a.id} offline`);
            a.state.health = 'DEAD';
            a.client.end();
         }
       });

       // Broadcast results INSTANTLY to dashboard
       setTimeout(() => {
          // @ts-ignore
          if (typeof broadcastMeshHealth === 'function') broadcastMeshHealth();
       }, 100);
    }
  }

  res.json({ status: 'injected', target: target.id, action });
});

// 4. Start Central Cluster (4 Ports)
MQTT_PORTS.forEach(p => {
    const srv = net.createServer(broker.handle);
    brokerServers.set(p, srv);
    srv.listen(p, '0.0.0.0', () => {
        console.log(`[SAR SERVICE] 🤖 Node ${p.toString().slice(-2)} ONLINE (Port ${p})`);
    });
    
    srv.on('error', (err) => {
        console.error(`[SAR SERVICE] Node ${p} error:`, err.message);
        brokerServers.delete(p);
    });
});

httpServer.listen(Number(port), '0.0.0.0', () => {
  console.log(`[SAR SERVICE] ⚡ Server running on port ${port} (0.0.0.0)`);
  console.log(`[SAR SERVICE] 🛰️  MQTT/WS Broker ready on same port via /mqtt (for dashboard)`);
});
