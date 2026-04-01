import { useEffect, useState, useRef, useCallback } from 'react';
import * as mqtt from 'mqtt';

export interface AgentState {
  id: string;
  type: 'drone' | 'rover' | 'ai-agent';
  pos: { x: number; y: number; z: number };
  battery: number;
  health: string;
  timestamp: number;
  brokerPort?: number;
  isDraining?: boolean;
}

export interface SwarmTask {
  taskId: string;
  pos: { x: number; y: number; z: number };
  type: string;
  winnerId?: string;
  detectedBy?: string;
  guardian?: string;
}

export interface SwarmEvent {
  id: string;
  text: string;
  time: string;
  type: 'info' | 'warning' | 'danger' | 'success';
}

export interface SimStatus {
  timer: number;
  message: string;
}

export interface MeshHealth {
  alive: number;
  total: number;
  latency: number;
  timestamp: number;
}

// ── SINGLETON GUARD ──────────────────────────────────────────────────────────
// Prevents double-initialization even if React re-runs the effect.
let globalClient: any = null;

export function useSwarm() {
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());
  const [tasks, setTasks] = useState<Map<string, SwarmTask>>(new Map());
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [simStatus, setSimStatus] = useState<SimStatus | null>(null);
  const [meshHealth, setMeshHealth] = useState<MeshHealth | null>(null);
  const [droneQuadrants, setDroneQuadrants] = useState<Map<string, number[]>>(new Map());
  const mqttRef = useRef<any>(null);
  const initRef = useRef(false);

  const addEvent = useCallback((text: string, type: SwarmEvent['type'] = 'info') => {
    setEvents(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      text,
      time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      type
    }, ...prev].slice(0, 100)); // CAP AT 100 FOR EXTENDED HISTORY
  }, []);

  useEffect(() => {
    // Guard: only initialize once per app lifetime
    if (initRef.current || globalClient) {
      mqttRef.current = globalClient;
      return;
    }
    initRef.current = true;

    const connectFn = (mqtt as any).connect || (mqtt as any).default?.connect;
    if (typeof connectFn !== 'function') {
      console.error('[BAYMAX] mqtt.connect not found');
      addEvent('MQTT BOOTSTRAP FAILED', 'danger');
      return;
    }

    // Auto-detect environment for MQTT host
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const DEFAULT_MQTT_URL = isLocal ? 'ws://localhost:4000/mqtt' : 'wss://baymax-sar.zeabur.app/mqtt';
    const MQTT_WS_URL = (import.meta as any).env.VITE_MQTT_URL || DEFAULT_MQTT_URL;

    console.log(`[BAYMAX] Connecting to broker at ${MQTT_WS_URL}...`);
    addEvent(`CONNECTING TO MESH...`, 'info');

    const client = connectFn(MQTT_WS_URL, {
      clientId: `baymax-dash-${Math.random().toString(16).slice(2, 8)}`,
      username: 'BAYMAX_SWARM',
      password: 'Baymax.Nand@k15',
      reconnectPeriod: 3000,
      connectTimeout: 10000,
      clean: true,
    });

    globalClient = client;
    mqttRef.current = client;

    client.on('connect', () => {
      console.log('[BAYMAX] ✅ MQTT Connected!');
      setConnected(true);
      client.subscribe([
        'swarm/state/#',
        'swarm/health/#',
        'swarm/task/verified',
        'swarm/task/unconfirmed',
        'swarm/task/bid/#',
        'swarm/task/completed',
        'swarm/events/#',
        'swarm/proof/#',
        'swarm/sim/status',
        'swarm/mesh/health',
        'swarm/drone/quadrant'
      ]);
      addEvent('TACTICAL LINK ESTABLISHED', 'success');
    });

    client.on('error', (err: any) => {
      console.error('[BAYMAX] MQTT Error:', err?.message || err);
      addEvent(`LINK ERROR: ${err?.message || 'unknown'}`, 'danger');
    });

    client.on('reconnect', () => {
      addEvent('RECONNECTING...', 'warning');
    });

    client.on('offline', () => {
      setConnected(false);
      addEvent('BROKER OFFLINE', 'danger');
    });

    client.on('close', () => {
      setConnected(false);
    });

    client.on('message', (topic: string, payload: any) => {
      try {
        const message = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
        const data = JSON.parse(message);

        if (topic.startsWith('swarm/state/')) {
          setAgents(prev => {
            const next = new Map(prev);
            next.set(data.id, data as AgentState);
            return next;
          });
          // Optional: Add sync pulsars here? No, keep it clean.
        }

        if (topic === 'swarm/task/verified') {
          setTasks(prev => {
            const next = new Map(prev);
            next.set(data.taskId, { ...data, status: 'verified' } as any);
            return next;
          });
          const source = data.detectedBy ? `[SENSE: ${data.detectedBy}]` : data.guardian ? `[RECOVERY: ${data.guardian}]` : '[COMMAND]';
          addEvent(`${source} 🛡️ THREAT CONFIRMED at (${data.pos.x.toFixed(0)}, ${data.pos.y.toFixed(0)})`, 'danger');
        }

        if (topic === 'swarm/task/unconfirmed') {
          setTasks(prev => {
            const next = new Map(prev);
            next.set(data.taskId, { ...data, status: 'unconfirmed' } as any);
            return next;
          });
          addEvent(`[MQTT] 🕵️ UNCONFIRMED POS - Awaiting Aerial Scan...`, 'warning');
        }

        if (topic === 'swarm/task/completed') {
          setTasks(prev => {
            const next = new Map(prev);
            next.delete(data.taskId);
            return next;
          });
          addEvent(`[P2P] ✅ MISSION SUCCESS: ${data.taskId} delivered!`, 'success');
        }

        if (topic.startsWith('swarm/events/dead/')) {
          const deadId = data.deadAgent || topic.split('/').pop() || 'unknown';
          addEvent(`AGENT OFFLINE: ${deadId}`, 'danger');
          
          setAgents(prev => {
            const next = new Map(prev);
            const agent = next.get(deadId);
            if (agent) next.set(deadId, { ...agent, health: 'DEAD' });
            return next;
          });
          
          // Clear quadrant ownership instantly when a drone dies
          setDroneQuadrants(prev => {
            const next = new Map(prev);
            next.delete(deadId);
            return next;
          });
        }

        if (topic.startsWith('swarm/task/bid/')) {
          addEvent(`[P2P] 🗳️ BID: ${data.agentId} cost ${data.cost?.toFixed(2) || '?' } for ${topic.split('/').pop()}`, 'info');
        }
    
        if (topic === 'swarm/proof/consensus') {
           addEvent(`[MESH] 🛡️ CONSENSUS: ${data.swarmSize} nodes synced in ${data.latency || '?'}ms`, 'success');
        }

        if (topic === 'swarm/sim/status') {
          setSimStatus(data as SimStatus);
        }

        if (topic === 'swarm/mesh/health') {
          setMeshHealth(data as MeshHealth);
          addEvent(`[MESH] ⚡ ${data.alive}/${data.total} nodes | Latency: ${data.latency}ms`, 'success');
        }

        if (topic === 'swarm/drone/quadrant') {
          const qList = data.quadrants || (data.quadrant ? [data.quadrant] : []);
          setDroneQuadrants(prev => {
            const next = new Map(prev);
            if (qList.length === 0 || (qList.length === 1 && qList[0] === 0)) {
               next.delete(data.agentId);
            } else {
               next.set(data.agentId, qList);
            }
            return next;
          });
        }

        if (topic === 'swarm/events/relay') {
          addEvent(`[RELAY] ⚠️ ${data.agentId} switching to RELAY MODE (low battery)`, 'warning');
        }

      } catch (e) {
        // Non-JSON payload, ignore
      }
    });

    // NOTE: No cleanup — we want this connection to survive React re-renders.
    // The globalClient singleton handles this.
  }, [addEvent]);

  const sendCommand = useCallback((topic: string, message: unknown) => {
    if (mqttRef.current?.connected) {
      mqttRef.current.publish(topic, JSON.stringify(message));
    }
  }, []);

  return {
    agents: Array.from(agents.values()),
    tasks: Array.from(tasks.values()),
    agentsMap: agents,
    events,
    connected,
    simStatus,
    meshHealth,
    droneQuadrants,
    sendCommand,
  };
}
