import { useEffect, useState, useRef, useCallback } from 'react';
import * as mqtt from 'mqtt';

export interface AgentState {
  id: string;
  type: 'drone' | 'rover' | 'ai-agent';
  pos: { x: number; y: number; z: number };
  battery: number;
  health: string;
  timestamp: number;
}

export interface SwarmTask {
  taskId: string;
  pos: { x: number; y: number; z: number };
  type: string;
  winnerId?: string;
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

// ── SINGLETON GUARD ──────────────────────────────────────────────────────────
// Prevents double-initialization even if React re-runs the effect.
let globalClient: any = null;

export function useSwarm() {
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map());
  const [tasks, setTasks] = useState<Map<string, SwarmTask>>(new Map());
  const [events, setEvents] = useState<SwarmEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [simStatus, setSimStatus] = useState<SimStatus | null>(null);
  const mqttRef = useRef<any>(null);
  const initRef = useRef(false);

  const addEvent = useCallback((text: string, type: SwarmEvent['type'] = 'info') => {
    setEvents(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      text,
      time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
      type
    }, ...prev].slice(0, 30));
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

    console.log('[BAYMAX] Connecting to FoxMQ WebSocket...');
    addEvent('CONNECTING TO FOXMQ...', 'info');

    const client = connectFn('ws://localhost:9001', {
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
        'swarm/task/bid/#',
        'swarm/events/#',
        'swarm/proof/#',
        'swarm/sim/status'
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
        }

        if (topic === 'swarm/task/verified') {
          setTasks(prev => {
            const next = new Map(prev);
            next.set(data.taskId, data as SwarmTask);
            return next;
          });
          addEvent(`THREAT @ (${data.pos.x.toFixed(0)}, ${data.pos.y.toFixed(0)})`, 'danger');
        }

        if (topic.startsWith('swarm/events/dead/')) {
          const id = topic.split('/').pop() || 'unknown';
          addEvent(`AGENT OFFLINE: ${id}`, 'danger');
          setAgents(prev => {
            const next = new Map(prev);
            const agent = next.get(id);
            if (agent) next.set(id, { ...agent, health: 'DEAD' });
            return next;
          });
        }

        if (topic.startsWith('swarm/task/bid/')) {
          addEvent(`BID by ${data.agentId || '?'}`, 'info');
        }

        if (topic === 'swarm/proof/consensus') {
          addEvent(`CONSENSUS: ${data.swarmSize} nodes`, 'success');
        }

        if (topic === 'swarm/sim/status') {
          setSimStatus(data as SimStatus);
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
    sendCommand,
  };
}
