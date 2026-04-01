import mqtt, { MqttClient } from 'mqtt';
import { v4 as uuidv4 } from 'uuid';
import { TaskEngine } from './task-engine.js';

import type {
  TrustScore, AgentType, HealthStatus, AgentState, SystemHealth
} from './types.js';

export class Agent {
  id: string;
  type: AgentType;
  public client: MqttClient;
  public state: AgentState;
  protected systemHealth: SystemHealth;
  protected peers: Map<string, AgentState> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private controlLoopInterval: NodeJS.Timeout | null = null;
  protected isDigital: boolean = false;
  protected taskEngine: TaskEngine;
  private watchdogInterval: NodeJS.Timeout | null = null;
  protected trustAlerts: Map<string, number> = new Map();
  public isFrozen: boolean = false;
  protected isDraining: boolean = false;
  protected drainRate: number = 0;
  // --- SIMULATION DATA (Hidden from the swarm) ---
  public physicalPos: { x: number; y: number; z: number };
  protected actualPeers: Map<string, { x: number; y: number; z: number }> = new Map();

  private static readonly BIRD_NAMES = [
    'HAWK', 'FALCON', 'EAGLE', 'OWL', 'VULTURE', 'SPARROW', 'PIGEON', 'CHICKEN', 
    'RAVEN', 'SWIFT', 'KESTREL', 'OSPREY', 'PHOENIX', 'CONDOR', 'ROBIN', 'FLAMINGO'
  ];
  private static readonly LAND_ANIMALS = [
    'WOLF', 'LION', 'TIGER', 'PANTHER', 'BEAR', 'JAGUAR', 'BULL', 'ELEPHANT', 
    'FOX', 'VIPER', 'RHINO', 'COYOTE', 'WOLVERINE', 'STALLION', 'MAMMOTH', 'TITAN'
  ];

  private knownTasks: Map<string, { taskId: string, pos: {x:number, y:number, z:number}, winnerId: string, timestamp: number, detectedBy?: string }> = new Map();

  constructor(type: AgentType, brokerPort = 1883) {
    // TACTICAL NAMING: DRO-Bird and ROV-Animal (Inverted as requested)
    const list = type === 'drone' ? Agent.BIRD_NAMES : Agent.LAND_ANIMALS;
    const prefix = type === 'drone' ? 'DRO' : 'ROV';
    
    const variantId = uuidv4().substring(0, 4);
    const callsign = list[Math.floor(Math.random() * list.length)];
    this.id = `${prefix}-${callsign}-${variantId}`;
    this.type = type;
    
    console.log(`[SYSTEM] 🟢 Deploying ${type.toUpperCase()}... Callsign: ${callsign} | Ref: ${variantId}`);
    const startX = Math.random() * 20;
    const startY = Math.random() * 20;
    const startZ = type === 'drone' ? (5 + Math.random() * 5) : 0; // Drones start in air, rovers on ground
    
    this.physicalPos = { x: startX, y: startY, z: startZ }; 
    this.state = {
      id: this.id,
      type,
      pos: { ...this.physicalPos },
      battery: 100,
      health: 'FULL',
      duties: this.getDefaultDuties(type),
      timestamp: Date.now(),
      trust: {
        location: 1.0,
        relay: 1.0,
        method: 'self-reported'
      },
      isBusy: false,
      brokerPort
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
      this.startControlLoop();
      this.announce();
    });

    this.taskEngine = new TaskEngine(this.id, this.client);
    
    // Listen for assignments from the engine
    this.taskEngine.on('task-assigned', (data: { taskId: string, pos: { x: number, y: number, z: number } }) => {
        this.onTaskAssigned(data.taskId, data.pos);
    });


    // Mission Guardian: Track resolved auctions
    this.taskEngine.on('task-resolved', (data) => {
      this.knownTasks.set(data.taskId, { 
        ...data, 
        timestamp: Date.now() // Initial heartbeat for the mission
      });
      console.log(`[${this.id}] 🛡️ MISSION TRACKING: ${data.taskId} | Winner: ${data.winnerId}`);
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

    this.taskEngine.on('task-resolved', ({ taskId, winnerId }) => {
      // Update our mission registry so we know who is supposed to be doing what
      const task = this.knownTasks.get(taskId);
      if (task) {
        task.winnerId = winnerId;
        console.log(`[${this.id}] 🤝 MISSION REGISTRY: ${taskId.slice(-4)} assigned to ${winnerId}`);
      }
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
    this.client.subscribe([
      'swarm/state/#', 
      'swarm/fault/emergency', 
      'swarm/sim/inject/#',
      'swarm/events/#',
      'swarm/health/#',
      'swarm/sim/actual/#', 
      'swarm/task/#'
    ]);
  }

  private startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.selfDiagnose();
      this.state.timestamp = Date.now();

      if (this.isDraining) {
        // PRECISE DRAIN: Always hits zero in exactly 8 seconds
        this.state.battery -= this.drainRate;
        (this.state as any).isDraining = true;
        if (this.state.battery <= 0) {
          this.state.battery = 0;
          (this.state as any).isDraining = false;
          // TRIGGER ACTUAL HARDWARE FAILURE AT THE END
          this.systemHealth.battery_sensor = false;
          this.selfDiagnose(); 
          this.client.publish(`swarm/state/${this.id}`, JSON.stringify(this.state));
          console.log(`[${this.id}] 🪫 BATTERY EXHAUSTED — Agent dying after 8s drain sequence.`);
          this.freeze();
          return;
        }
      } else {
        this.state.battery = Math.max(0, this.state.battery - 0.01); // Normal slow drain
        (this.state as any).isDraining = false;
      }
      
      this.client.publish(`swarm/state/${this.id}`, JSON.stringify(this.state));

      if (!this.isDigital) {
        this.client.publish(`swarm/sim/actual/${this.id}`, JSON.stringify(this.physicalPos));
      }
    }, 1000);
  }

  private startControlLoop() {
    if (this.controlLoopInterval) clearInterval(this.controlLoopInterval);
    this.controlLoopInterval = setInterval(() => {
      this.update();
    }, 100); // 10Hz control loop for smooth motion
  }

  /**
   * Pushes the current state to MQTT instantly. 
   * Useful for simulations to achieve high-frequency animation.
   */
  public publishState() {
    if (this.isFrozen) return;
    this.state.timestamp = Date.now();
    this.state.isBusy = this.getBusyStatus();
    this.client.publish(`swarm/state/${this.id}`, JSON.stringify(this.state));
    
    if (!this.isDigital) {
      this.client.publish(`swarm/sim/actual/${this.id}`, JSON.stringify(this.physicalPos));
    }
  }

  // Returns the ground height at a given (x,y) coordinating with the 3D dashboard
  public getTerrainHeight(x: number, y: number): number {
    const lx = x - 25;
    const ly = y - 30;
    return Math.sin(lx * 0.1) * Math.cos(ly * 0.1) * 3 + Math.sin(lx * 0.05) * 1.5;
  }

  protected getBusyStatus(): boolean {
    return false;
  }

  protected update() {
    if (this.isFrozen) return;
  }


  private startWatchdog() {
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    this.watchdogInterval = setInterval(() => {
      const now = Date.now();
      this.peers.forEach((peer, peerId) => {
        const silence = now - peer.timestamp;
        if (silence > 10000 && peer.health !== 'DEAD') {
          // 1. Mark locally
          peer.health = 'DEAD';

          // 2. Publish to the Shared Event Log (no console spam)
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
      // 3. Mission Guardian: Detect dead rescuers or vanished winners
      this.knownTasks.forEach((task, taskId) => {
        // VALIDATION: Skip re-broadcasting malformed tasks
        if (!task.pos || isNaN(task.pos.x) || isNaN(task.pos.y)) {
          this.knownTasks.delete(taskId);
          return;
        }

        const winner = this.peers.get(task.winnerId);
        
        // If winner is explicitly DEAD OR if winner has vanished from the mesh (stale/disconnected)
        // We use a 15s grace period for mesh instability
        const isOrphaned = (winner && winner.health === 'DEAD') || 
                           (!winner && task.winnerId !== this.id && (Date.now() - task.timestamp > 20000));

        if (isOrphaned) {
            // We found an orphaned mission. The 'Lowest ID living Drone' will take the lead.
            const livingDrones = Array.from(this.peers.values())
              .filter(p => p.type === 'drone' && p.health !== 'DEAD')
              .concat(this.type === 'drone' && this.state.health !== 'DEAD' ? [this.state] : []);
            
            livingDrones.sort((a, b) => a.id.localeCompare(b.id));

            if (livingDrones[0]?.id === this.id) {
              console.log(`[${this.id}] 🛡️  MISSION GUARDIAN: Orphaned task detected (${taskId}). Re-broadcasting...`);
              this.client.publish('swarm/task/verified', JSON.stringify({
                ...task,
                type: 'RESCUE_NEEDED',
                timestamp: Date.now(),
                guardian: this.id // Note that this is a recovery broadcast
              }));
              this.knownTasks.delete(taskId);
            }
        }
      });

      // 4. Dropped Payload Guardian: Detect if a dead agent was carrying a victim
      this.peers.forEach((peer, peerId) => {
        const carries = (peer as any).carryingTaskId;
        if (peer.health === 'DEAD' && carries) {
           // We found a dropped payload! Only the 'Lowest ID living Drone' re-advertises.
           const livingDrones = Array.from(this.peers.values())
             .filter(p => p.type === 'drone' && p.health !== 'DEAD')
             .concat(this.type === 'drone' && this.state.health !== 'DEAD' ? [this.state] : []);
           
           livingDrones.sort((a, b) => a.id.localeCompare(b.id));

           if (livingDrones[0]?.id === this.id) {
             console.log(`[${this.id}] 🛡️  DROPPED PAYLOAD DETECTED: Task ${carries} dropped by ${peerId}. Re-dispatching to (${peer.pos.x.toFixed(1)}, ${peer.pos.y.toFixed(1)})`);
             this.client.publish('swarm/task/verified', JSON.stringify({
               taskId: carries,
               pos: peer.pos, // Use the drop location!
               type: 'RESCUE_NEEDED',
               timestamp: Date.now()
             }));
             // Clear the carry status locally to prevent multiple re-broadcasts
             delete (peer as any).carryingTaskId;
           }
        }
      });
    }, 1000); // 1s check is enough for robustness
  }



  protected onMessage(topic: string, payload: string) {
    if (topic.startsWith('swarm/state/')) {
      const peer: AgentState = JSON.parse(payload);
      if (peer.id !== this.id) {
        this.peers.set(peer.id, peer);
        this.verifyPeer(peer.id);
      }
    }
     if (topic.startsWith('swarm/events/dead/')) {
      const event = JSON.parse(payload);
      console.log(`[${this.id}] 📢 SWARM EVENT: Agent ${event.deadAgent} (${event.type}) is officially DEAD`);
      
      // Update local peer registry immediately to trigger Mission Guardian
      const peer = this.peers.get(event.deadAgent);
      if (peer) {
        peer.health = 'DEAD';
      }
    }
    if (topic.startsWith('swarm/events/trust/')) {
      const event = JSON.parse(payload);
      console.log(`[${this.id}] 📢 MESH CONSENSUS: Agent ${event.liarId} is UNRELIABLE (Caught by ${event.detectedBy})`);
    }
    if (topic === 'swarm/fault/emergency') {
      const data = JSON.parse(payload);
      // If no target is specified, it's a GLOBAL freeze. If target matches, kill self.
      if (!data.target || data.target === this.id) {
        console.log(`[${this.id}] 🛑 EMERGENCY SHUTDOWN RECEIVED`);
        this.freeze();
      }
    }
    if (topic === 'swarm/sim/inject/fail') {
      const data = JSON.parse(payload);
      if (data.id === this.id) {
        this.failSystem(data.system);
      }
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

    // Task Negotiation 
    if (topic.startsWith('swarm/task/verified')) {
        const task = JSON.parse(payload);
        
        // VALIDATION: Reject tasks without valid coordinates
        if (!task.pos || isNaN(task.pos.x) || isNaN(task.pos.y)) {
          console.warn(`[${this.id}] ⚠️  MALFORMED TASK: Ignored task ${task.taskId} (missing position)`);
          return;
        }

        // Always track in knownTasks so the Mission Guardian can monitor for failure
        this.knownTasks.set(task.taskId, { ...task, winnerId: 'pending' });

        
        // Strict Role-Based Bidding:
        // Drones (Birds) only bid for Scouting/Detection.
        // Rovers (Land Animals) only bid for Rescue/Interception.
        const isRescueTask = task.type === 'RESCUE_NEEDED' || task.type === 'RESCUE_NEEDED_RETRY';
        const canBid = (this.type === 'rover' && isRescueTask) || 
                       (this.type === 'drone' && !isRescueTask);

        // CRITICAL: Busy agents MUST NOT BID — ensures decentralized load distribution
        // A rover already carrying a victim cannot take another mission.
        // This prevents a single rover from monopolising all targets.
        const alreadyBusy = this.getBusyStatus();
        if (alreadyBusy) {
            console.log(`[${this.id}] ⏸  BUSY — skipping bid for ${task.taskId} (decentralized load balance)`);
            return;
        }

        if (canBid) {
            this.taskEngine.handleTask(task.taskId, task.pos, this.state);
        } else {
            console.log(`[${this.id}] 🛰️  ROLE FILTER: Task ${task.taskId} not in ${this.type} duties.`);
        }
    }
    if (topic.startsWith('swarm/task/bid/')) {
        const bid = JSON.parse(payload);
        const taskId = topic.split('/')[3] || 'unknown';
        this.taskEngine.collectBid(taskId, bid);
    }
    if (topic === 'swarm/task/completed') {
        const data = JSON.parse(payload);
        this.knownTasks.delete(data.taskId);
        console.log(`[${this.id}] 🏁 MISSION COMPLETED: Registry cleared for ${data.taskId}`);
        this.abortMission(data.taskId);
    }
}

  private getActiveCount(): number {
    return 1 + Array.from(this.peers.values()).filter(p => p.health !== 'DEAD').length;
  }

  protected freeze() {
    console.log(`[${this.id}] ❄️ FREEZING AGENT`);
    this.isFrozen = true;
    this.isDraining = false;
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.watchdogInterval) clearInterval(this.watchdogInterval);
    if (this.controlLoopInterval) clearInterval(this.controlLoopInterval);
    this.state.health = 'DEAD';
    this.state.battery = 0;
    (this.state as any).isDraining = false;
    // Final broadcast of DEAD state
    this.client.publish(`swarm/state/${this.id}`, JSON.stringify(this.state), { retain: true });
    // Broadcast dead event so others know immediately
    this.client.publish(`swarm/events/dead/${this.id}`, JSON.stringify({
      deadAgent: this.id,
      type: this.type,
      detectedBy: this.id, // self-reported
      timestamp: Date.now()
    }), { qos: 2 });
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

    if (!this.systemHealth.battery_sensor || !this.systemHealth.radio) {
      this.state.health = 'DEAD';
      this.freeze();
    } else if (!this.systemHealth.gps) {
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
    if (system === 'battery_sensor') {
      // BATTERY DRAIN: Depletes in exactly 8 seconds
      // Note: We don't set systemHealth.battery_sensor = false here yet!
      // This allows the 8s countdown to finish before selfDiagnose() kills the agent.
      this.isDraining = true;
      this.drainRate = this.state.battery / 8;
      console.log(`[${this.id}] 🔋 BATTERY DRAIN MODE: Depleting to zero in exactly 8 seconds...`);
    } else {
      // GPS / Radio failures trigger immediate self-diagnosis
      this.systemHealth[system] = false;
      this.selfDiagnose();
    }
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
    if (this.isDigital) return; // Digital agents (AI) have no radio/CTM hardware
    
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
    if (diff > 200.0) { // CTM Threshold at 200m (Strictly for Scenario 3 spoofing)
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

  // To be overridden by subclasses (e.g. Rover)
  protected onTaskAssigned(taskId: string, pos: { x: number; y: number; z: number }) {
      console.log(`[${this.id}] 🎯 I WON THE AUCTION for ${taskId}! Preparing mission...`);
  }

  protected abortMission(taskId: string) {
      // Base implementation: just a placeholder
  }
}
