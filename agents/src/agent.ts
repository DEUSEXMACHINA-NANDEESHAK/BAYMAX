import mqtt, { MqttClient } from 'mqtt';
import { v4 as uuidv4 } from 'uuid';

export type AgentType = 'drone' | 'rover' | 'ai-agent';
export type HealthStatus = 'FULL' | 'DEGRADED-L' | 'DEGRADED-S' | 'RELAY-ONLY' | 'DEAD';

export interface AgentState {
  id: string;
  type: AgentType;
  pos: { x: number; y: number };
  battery: number;
  health: HealthStatus;
  duties: string[];
  timestamp: number;
}

export interface SystemHealth {
  gps: boolean;
  camera: boolean;
  radio: boolean;
  battery_sensor: boolean;
}

export class Agent {
  id: string;
  type: AgentType;
  client: MqttClient;
  state: AgentState;
  systemHealth: SystemHealth;
  peers: Map<string, AgentState> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private watchdogInterval: NodeJS.Timeout | null = null;

  constructor(type: AgentType, brokerPort = 1883) {
    this.id = `${type}-${uuidv4().slice(0, 6)}`;
    this.type = type;

    this.state = {
      id: this.id,
      type,
      pos: { x: Math.random() * 20, y: Math.random() * 20 },
      battery: 90,
      health: 'FULL',
      duties: this.getDefaultDuties(type),
      timestamp: Date.now()
    };

    this.systemHealth = {
      gps: true,
      camera: true,
      radio: true,
      battery_sensor: true
    };

    this.client = mqtt.connect(`mqtt://localhost:${brokerPort}`, {
      clientId: this.id,
      clean: true,
      reconnectPeriod: 500,
      username: 'BAYMAX_SWARM',
      password: 'Baymax.Nand@k15'
    });

    this.client.on('connect', () => {
      console.log(`[${this.id}] connected to broker on port ${brokerPort}`);
      this.subscribe();
      this.startHeartbeat();
      this.startWatchdog();
      this.announce();
    });


    this.client.on('error', (err) => {
      console.error(`[${this.id}] MQTT Error:`, err.message);
    });

    this.client.on('offline', () => {
      console.warn(`[${this.id}] MQTT Offline (reconnecting...)`);
    });

    this.client.on('message', (topic, payload) => {
      this.onMessage(topic, payload.toString());
    });
  }

  private getDefaultDuties(type: AgentType): string[] {
    const duties: Record<AgentType, string[]> = {
      drone: ['location', 'detection', 'relay', 'task_bidding'],
      rover: ['location', 'interception', 'task_bidding'],
      'ai-agent': ['analysis', 'coordination_proof', 'task_bidding']
    };
    return duties[type];
  }

  private subscribe() {
    this.client.subscribe(['swarm/state/#', 'swarm/fault/emergency']);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.state.timestamp = Date.now();
      this.state.battery -= 0.01;
      
      this.client.publish(
        `swarm/state/${this.id}`,
        JSON.stringify(this.state),
        { qos: 1 }
      );
      console.log(
        `[${this.id}] 💓 heartbeat: (${this.state.pos.x.toFixed(1)},${this.state.pos.y.toFixed(1)}) battery:${this.state.battery.toFixed(1)} health:${this.state.health}`
      );
    }, 1000);
  }


  private startWatchdog() {
    this.watchdogInterval = setInterval(() => {
      const now = Date.now();
      this.peers.forEach((peer, peerId) => {
        const silence = now - peer.timestamp;
        if (silence > 3000 && peer.health !== 'DEAD') {  // 3 seconds for now, wolfie can change depending upon parameters
          console.log(
            `[${this.id}] 💀 DETECTED ${peerId} as DEAD (silent ${Math.round(silence/1000)}s)`
          );
          peer.health = 'DEAD';
        }
      });
    }, 500);  // check every 500ms for now, wolfie can change depending upon parameters
  }


  private onMessage(topic: string, payload: string) {
    if (topic.startsWith('swarm/state/')) {
      const peer: AgentState = JSON.parse(payload);
      console.log(`[${this.id}] swarm size: ${this.peers.size + 1} agents total`);
      if (peer.id !== this.id) {
        this.peers.set(peer.id, peer);
        console.log(`[${this.id}] saw peer ${peer.id} (${peer.type}) at (${peer.pos.x.toFixed(1)},${peer.pos.y.toFixed(1)})`);
        console.log(`[${this.id}] swarm size(original): ${this.peers.size + 1} agents total`);
        console.log(`[${this.id}] swarm size(current): ${this.getActiveCount()} active`);
      }
    }
    if (topic === 'swarm/fault/emergency') {
      console.log(`[${this.id}] EMERGENCY FREEZE received`);
      this.freeze();
    }
  }

  private getActiveCount(): number {
    return 1 + Array.from(this.peers.values()).filter(p => p.health !== 'DEAD').length;
  }

  private freeze() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.state.health = 'DEAD';
  }

  private announce() {
    this.client.publish(
      `swarm/discovery/${this.id}`,
      JSON.stringify({
        id: this.id,
        type: this.type,
        capabilities: this.state.duties,
        timestamp: Date.now()
      })
    );
  }
}
