import { Agent } from './agent.js';

/**
 * DRONE — Aerial Scout
 * Responsibilities:
 * 1. Consensus-based quadrant assignment (negotiated via FoxMQ mesh)
 * 2. Continuous patrol of assigned quadrant at altitude
 * 3. Discovery: If XY proximity to an unconfirmed target < 15 units → broadcast verified task
 * 4. Relay Mode: When battery < 25%, hover at centroid between active agents and relay packets
 * 5. GPS Failure: On DEGRADED health, narrow patrol area but keep moving
 */
export class Drone extends Agent {
  private scoutTarget: { x: number; y: number; z: number } | null = null;
  private quadrant: number = 0; // 0 = unassigned
  private claimedQuadrants: Set<number> = new Set();
  private unconfirmedTasks: Map<string, any> = new Map();
  private isRelayMode: boolean = false;
  private lastQuadrantAnnounce: number = 0;

  constructor(brokerPort = 1883) {
    super('drone', brokerPort);

    // Listen for unconfirmed placements (human-placed targets)
    this.client.subscribe('swarm/task/unconfirmed');
    // Listen for other drones' quadrant claims
    this.client.subscribe('swarm/drone/quadrant');

    this.client.on('message', (topic: string, payload: Buffer) => {
      const msg = payload.toString();
      try {
        const data = JSON.parse(msg);

        if (topic === 'swarm/task/unconfirmed') {
          this.unconfirmedTasks.set(data.taskId, data);
        }

        if (topic === 'swarm/task/verified') {
          // Clear from unconfirmed once another drone or we confirmed it
          this.unconfirmedTasks.delete(data.taskId);
        }

        if (topic === 'swarm/drone/quadrant') {
          // Record what quadrant another drone claimed
          if (data.agentId !== this.id && data.quadrant) {
            this.claimedQuadrants.add(data.quadrant);
            // If another drone claimed our quadrant, re-negotiate
            if (data.quadrant === this.quadrant && data.agentId < this.id) {
              console.log(`[${this.id}] ⚡ QUADRANT ${this.quadrant} CONFLICT — yielding to ${data.agentId}`);
              this.quadrant = 0; // Will re-negotiate next update cycle
            }
          }
        }

      } catch { /* ignore non-JSON */ }
    });

    // Claim quadrant after connecting — slight delay to let peers announce first
    setTimeout(() => this.negotiateQuadrant(), 2000 + Math.random() * 1000);
  }

  private negotiateQuadrant() {
    if (this.isRelayMode) {
      this.quadrant = 0;
      return;
    }

    // Find an unclaimed quadrant (1-4)
    for (let q = 1; q <= 4; q++) {
      if (!this.claimedQuadrants.has(q)) {
        this.quadrant = q;
        break;
      }
    }
    
    // Fallback to random if all 4 are (seemingly) taken
    if (this.quadrant === 0) this.quadrant = Math.ceil(Math.random() * 4);

    console.log(`[${this.id}] 🗳️  CONSENSUS: Claiming sector Q${this.quadrant}`);
    this.announceQuadrant();
  }

  private announceQuadrant() {
    this.lastQuadrantAnnounce = Date.now();
    this.client.publish('swarm/drone/quadrant', JSON.stringify({
      agentId: this.id,
      quadrant: this.quadrant,
      timestamp: Date.now()
    }));
  }

  protected getBusyStatus(): boolean {
    return this.isRelayMode;
  }

  // 2D XY distance — ignores altitude to correctly judge "overhead" proximity
  private getDist2D(tx: number, ty: number): number {
    return Math.sqrt(
      Math.pow(tx - this.physicalPos.x, 2) +
      Math.pow(ty - this.physicalPos.y, 2)
    );
  }

  protected update() {
    if (this.isFrozen) return;

    // Re-negotiate quadrant if lost
    if (this.quadrant === 0) {
      this.negotiateQuadrant();
      return;
    }

    // RELAY MODE: Low battery — release sector and relay
    if (this.state.battery < 25 && !this.isRelayMode) {
      this.isRelayMode = true;
      this.quadrant = 0; // Release sector for others to pick up
      console.log(`[${this.id}] ⚡ BATTERY LOW! Entering RELAY MODE — releasing sector Q${this.quadrant}`);
      this.client.publish('swarm/events/relay', JSON.stringify({
        agentId: this.id,
        mode: 'RELAY',
        timestamp: Date.now()
      }));
      this.announceQuadrant(); // Announce Q0 to clear registry
    }

    // PERIODIC RE-ANNOUNCE (every 5s) to keep mesh/dashboard synced
    if (Date.now() - this.lastQuadrantAnnounce > 5000) {
      this.announceQuadrant();
      // Also clear stale knowledge to allow re-negotiation if a peer vanished
      this.claimedQuadrants.clear();
    }

    this.unconfirmedTasks.forEach((task, taskId) => {
      const dist2D = this.getDist2D(task.pos.x, task.pos.y);
      // 4 unit radius: drone must be very precisely overhead
      if (dist2D < 4.0) {
        console.log(`[${this.id}] 🛰️  DISCOVERY: ${taskId} spotted at XY dist ${dist2D.toFixed(1)}m — relaying to rovers`);
        this.client.publish('swarm/task/verified', JSON.stringify({
          ...task,
          detectedBy: this.id,
          timestamp: Date.now()
        }));
        this.unconfirmedTasks.delete(taskId);
      }
    });

    if (this.isRelayMode) {
      // Hover at current position (just continue broadcasting state)
      return;
    }

    // PATROL: Move toward next scout waypoint
    const arrived = !this.scoutTarget || this.getDist2D(this.scoutTarget.x, this.scoutTarget.y) < 3;
    if (arrived) {
      this.scoutTarget = this.getNextWaypoint();
      console.log(`[${this.id}] 🦅 Q${this.quadrant} WAYPOINT: (${this.scoutTarget.x.toFixed(0)}, ${this.scoutTarget.y.toFixed(0)})`);
    }

    if (this.scoutTarget) {
      this.physicalPos.x += (this.scoutTarget.x - this.physicalPos.x) * 0.035;
      this.physicalPos.y += (this.scoutTarget.y - this.physicalPos.y) * 0.035;
      this.physicalPos.z += (this.scoutTarget.z - this.physicalPos.z) * 0.035;
      this.state.pos = { ...this.physicalPos };
    }
  }

  private getNextWaypoint(): { x: number; y: number; z: number } {
    // Grid is 50x60. 4 quadrants + overflow
    const q = ((this.quadrant - 1) % 4) + 1;
    let minX = 0, maxX = 25, minY = 0, maxY = 30;
    if (q === 2) { minX = 25; maxX = 50; }
    if (q === 3) { minY = 30; maxY = 60; }
    if (q === 4) { minX = 25; maxX = 50; minY = 30; maxY = 60; }

    // GPS degraded: tighten patrol to near-center
    if (this.state.health === 'DEGRADED-L') {
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      minX = midX - 8; maxX = midX + 8;
      minY = midY - 8; maxY = midY + 8;
      console.log(`[${this.id}] 📡 GPS DEGRADED — tightening patrol to safe zone of Q${this.quadrant}`);
    }

    return {
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY),
      z: 7 + Math.random() * 4 // scouting altitude
    };
  }
}
