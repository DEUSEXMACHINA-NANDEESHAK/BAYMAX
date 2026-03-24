import mqtt, { MqttClient } from 'mqtt';
import { v4 as uuidv4 } from 'uuid';

// 1. Add this interface near the top
export interface TrustScore {
  location: number; // 0.0 - 1.0 (confidence in reported GPS)
  relay: number;    // 0.0 - 1.0 (confidence in message forwarding)
  method: 'self-reported' | 'peer-verified' | 'mesh-assigned';
}
export type AgentType = 'drone' | 'rover' | 'ai-agent';
export type HealthStatus = 'FULL' | 'DEGRADED-L' | 'DEGRADED-S' | 'RELAY-ONLY' | 'DEAD';

export interface AgentState {
  id: string;
  type: AgentType;
  pos: { x: number; y: number; z: number }; // <-- Now 3D!
  battery: number;
  health: HealthStatus;
  duties: string[];
  timestamp: number;
  trust: TrustScore;
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
  protected client: MqttClient;
  protected state: AgentState;
  protected systemHealth: SystemHealth;
  protected peers: Map<string, AgentState> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  protected isDigital: boolean = false;
  private watchdogInterval: NodeJS.Timeout | null = null;
  protected trustAlerts: Map<string, number> = new Map();
  // --- SIMULATION DATA (Hidden from the swarm) ---
  protected physicalPos: { x: number; y: number; z: number };
  protected actualPeers: Map<string, { x: number; y: number; z: number }> = new Map();

  constructor(type: AgentType, brokerPort = 1883) {
    this.id = `${type}-${uuidv4().slice(0, 6)}`;
    this.type = type;
    const startX = Math.random() * 20;
    const startY = Math.random() * 20;
    const startZ = type === 'drone' ? (5 + Math.random() * 5) : 0; // Drones start in air, rovers on ground
    
    this.physicalPos = { x: startX, y: startY, z: startZ }; 
    this.state = {
      id: this.id,
      type,
      pos: { x: startX, y: startY, z: startZ },
      battery: 90,
      health: 'FULL',
      duties: this.getDefaultDuties(type),
      timestamp: Date.now(),
      trust: {
        location: 1.0, // Start with full trust
        relay: 1.0,
        method: 'self-reported'
      }
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
    this.client.subscribe(['swarm/state/#', 'swarm/fault/emergency', 'swarm/events/#','swarm/health/#','swarm/sim/actual/#']);
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.selfDiagnose();
      this.state.timestamp = Date.now();
      this.state.battery -= 0.01;
      
     // Simulation: Publish our "Actual" physical position (hidden from agents, used by CTM)
    if (!this.isDigital) {
      this.client.publish(`swarm/sim/actual/${this.id}`, JSON.stringify(this.physicalPos));
    }

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
        if (silence > 3000 && peer.health !== 'DEAD') {
          // 1. Mark locally
          peer.health = 'DEAD';

          // 2. Publish to the Shared Event Log
          console.log(`[${this.id}] 💀 LOCAL WATCHDOG: Detected ${peerId} as DEAD`);
          this.client.publish(
            `swarm/events/dead/${peerId}`,
            JSON.stringify({
              deadAgent: peerId,
              type: peer.type,
              detectedBy: this.id,
              timestamp: Date.now()
            }),
            { qos: 2 }
          );
        }
      });
    }, 500);
  }



  private onMessage(topic: string, payload: string) {
    if (topic.startsWith('swarm/state/')) {
      const peer: AgentState = JSON.parse(payload);
      console.log(`[${this.id}] swarm size: ${this.peers.size + 1} agents total`);
      if (peer.id !== this.id) {
        this.peers.set(peer.id, peer);
        this.verifyPeer(peer.id);
        console.log(`[${this.id}] saw peer ${peer.id} (${peer.type}) at (${peer.pos.x.toFixed(1)},${peer.pos.y.toFixed(1)})`);
        console.log(`[${this.id}] swarm size(original): ${this.peers.size + 1} agents total`);
        console.log(`[${this.id}] swarm size(current): ${this.getActiveCount()} active`);
      }
    }
    if (topic.startsWith('swarm/events/dead/')) {
      const event = JSON.parse(payload);
      console.log(`[${this.id}] 📢 SWARM EVENT: Agent ${event.deadAgent} (${event.type}) is officially DEAD (detected by ${event.detectedBy})`);
    }
    if (topic.startsWith('swarm/events/trust/')) {
      const event = JSON.parse(payload);
      console.log(`[${this.id}] 📢 MESH CONSENSUS: Agent ${event.liarId} is UNRELIABLE (Caught by ${event.detectedBy})`);
    }
    if (topic === 'swarm/fault/emergency') {
      console.log(`[${this.id}] EMERGENCY FREEZE received`);
      this.freeze();
    }
    if (topic.startsWith('swarm/health/')) {
      const event = JSON.parse(payload);
      // ALL agents (including self) print the mesh-wide alert
      console.log(`[${this.id}] 🛰️  MESH ALERT: Agent ${event.id} is now ${event.health}`);
    }
    if (topic.startsWith('swarm/sim/actual/')) {
      const actual = JSON.parse(payload);
      const peerId = topic.split('/').pop()!; // Get ID from the end of the topic
      
      if (peerId !== this.id) {
        this.actualPeers.set(peerId, actual);
      }
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
  
    // --- PARTIAL FAILURE ISOLATION (PFI) ---
  public selfDiagnose() {
    const prevHealth = this.state.health;

    if (!this.systemHealth.gps) {
      this.state.health = 'DEGRADED-L';
      this.state.duties = this.getDefaultDuties(this.type).filter(d => d !== 'location');
    } else {
      this.state.health = 'FULL';
      this.state.duties = this.getDefaultDuties(this.type);
    }

    if (prevHealth !== this.state.health) {
      // BROADCAST TO MESH (NO LOCAL LOG HERE - onMessage will handle it)
      this.client.publish(
        `swarm/health/${this.id}`,
        JSON.stringify({
          id: this.id,
          health: this.state.health,
          duties: this.state.duties,
          timestamp: Date.now()
        }),
        { qos: 2, retain: true }
      );
    }
  }


  public failSystem(system: keyof SystemHealth) {
    this.systemHealth[system] = false;
    console.log(`[${this.id}] ⚡ SYSTEM FAILURE INJECTED: ${system.toUpperCase()}`);
    // Manually trigger a diagnosis immediately
    this.selfDiagnose();
  }
  // --- Day 4: CTM HELPERS ---

  /**
   * Simulates Signal Strength (RSSI) based on distance.
   * -40 to -50 dBm = Very Close
   * -60 to -70 dBm = Getting far
   * -90 dBm = Connection lost
   */
  private calculateRSSI(peerId: string): number | null {
    const actual = this.actualPeers.get(peerId);
    if (!actual) return null; // SAFETY: No simulation data yet

    // Distance between MY physical position and THEIR physical position (3D)
    const dx = this.physicalPos.x - actual.x;
    const dy = this.physicalPos.y - actual.y;
    const dz = this.physicalPos.z - actual.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const rssi = -30 - (20 * Math.log10(distance + 1));
    return Math.round(rssi);
  }

  private verifyPeer(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    // 1. Skip verification for digital entities (AI Agents)
    if (peer.type === 'ai-agent') return;

    const dx = this.state.pos.x - peer.pos.x;
    const dy = this.state.pos.y - peer.pos.y;
    const dz = this.state.pos.z - peer.pos.z;
    const gpsDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    const rssi = this.calculateRSSI(peerId);
    if (rssi === null) return; // Skip if sim data hasn't arrived yet

    const rssiDistance = Math.pow(10, (rssi + 30) / -20) - 1;

    // 2. Trust Evaluation
    const diff = Math.abs(gpsDistance - rssiDistance);
    if (diff > 5.0) {
      peer.trust.location = 0;
      
      // STREAM 1: LOCAL OBSERVATION
      console.log(`[${this.id}] 🛑 LOCAL CTM: I suspect ${peerId} is spoofing (Delta: ${diff.toFixed(1)}m)`);

      // STREAM 2: INSTANT GLOBAL BROADCAST (with 5s cooldown)
      const lastAlert = this.trustAlerts.get(peerId) || 0;
      if (Date.now() - lastAlert > 5000) {
        this.trustAlerts.set(peerId, Date.now());

        this.client.publish(
          `swarm/events/trust/${peerId}`,
          JSON.stringify({
            liarId: peerId,
            detectedBy: this.id,
            timestamp: Date.now()
          }),
          { qos: 2 }
        );
      }
    } else {
      peer.trust.location = Math.min(1.0, peer.trust.location + 0.05);
    }
  }
}
