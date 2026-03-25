import { Agent } from './agent.js';

/**
 * ROVER — Ground Rescue Unit
 * Responsibilities:
 * 1. Continuous slow patrol of assigned patrol sector (always moving, never idle)
 * 2. On task assignment: intercept victim location
 * 3. On arrival: pick up victim, return to base (0,0)
 * 4. On delivery: broadcast mission complete, resume patrol
 * 
 * IMPORTANT: Uses 2D XY distance checks only — Z is derived from terrain and must NOT
 * be used in arrival detection (terrain fluctuation causes dead-lock oscillation).
 */
export class Rover extends Agent {
  private currentMission: { x: number; y: number } | null = null;
  private currentTaskId: string | null = null;
  private hasVictim = false;
  private patrolTarget: { x: number; y: number } | null = null;
  private unconfirmedTasks: Map<string, any> = new Map();

  constructor(brokerPort = 1883) {
    super('rover', brokerPort);

    // Rovers can also discover targets if they pass near them!
    this.client.subscribe('swarm/task/unconfirmed');
    this.client.on('message', (topic: string, payload: Buffer) => {
      if (topic === 'swarm/task/unconfirmed') {
        try {
          const data = JSON.parse(payload.toString());
          this.unconfirmedTasks.set(data.taskId, data);
        } catch { /* ignore */ }
      }
      if (topic === 'swarm/task/verified') {
        try {
          const data = JSON.parse(payload.toString());
          this.unconfirmedTasks.delete(data.taskId);
        } catch { /* ignore */ }
      }
    });

    // Pick initial random patrol immediately
    this.patrolTarget = this.randomPatrolPoint();
    console.log(`[${this.id}] 🚜 ROVER ONLINE — beginning patrol`);
  }

  protected getBusyStatus(): boolean {
    return this.currentMission !== null || this.hasVictim;
  }

  // 2D distance ONLY — terrain Z shifts constantly and must not affect arrival checks
  private getDist2D(tx: number, ty: number): number {
    return Math.sqrt(
      Math.pow(tx - this.physicalPos.x, 2) +
      Math.pow(ty - this.physicalPos.y, 2)
    );
  }

  private randomPatrolPoint(): { x: number; y: number } {
    return {
      x: 5 + Math.random() * 40,
      y: 5 + Math.random() * 50
    };
  }

  protected update() {
    if (this.isFrozen) return;

    // GROUND DISCOVERY: If a rover passes very near an unconfirmed target (e.g. 3m), it discovers it!
    this.unconfirmedTasks.forEach((task, taskId) => {
      const dist2D = this.getDist2D(task.pos.x, task.pos.y);
      if (dist2D <2.0) {
        console.log(`[${this.id}] 🚜 GROUND DISCOVERY: ${taskId} found at dist ${dist2D.toFixed(1)}m — verifying for swarm`);
        this.client.publish('swarm/task/verified', JSON.stringify({
          ...task,
          detectedBy: this.id,
          timestamp: Date.now()
        }));
        this.unconfirmedTasks.delete(taskId);
      }
    });

    if (this.currentMission) {
      // Move toward mission (victim or base)
      this.moveTo(this.currentMission.x, this.currentMission.y);

      const dist = this.getDist2D(this.currentMission.x, this.currentMission.y);

      if (dist < 1.2) {
        if (!this.hasVictim) {
          // Arrived at victim
          console.log(`[${this.id}] 🚑 PICKUP: Secured ${this.currentTaskId} — heading to base`);
          this.hasVictim = true;
          (this.state as any).carryingTaskId = this.currentTaskId;
          this.currentMission = { x: 0, y: 0 }; // Return to Base
        } else {
          // Arrived at base
          console.log(`[${this.id}] 🏁 DELIVERY: Mission ${this.currentTaskId} complete — victim at base`);
          if (this.currentTaskId) {
            this.client.publish('swarm/task/completed', JSON.stringify({ taskId: this.currentTaskId }));
            this.client.publish('swarm/events/delivered', JSON.stringify({
              agentId: this.id,
              taskId: this.currentTaskId,
              timestamp: Date.now()
            }));
          }
          this.hasVictim = false;
          delete (this.state as any).carryingTaskId;
          this.currentMission = null;
          this.currentTaskId = null;
          this.patrolTarget = this.randomPatrolPoint(); // resume patrol
        }
      }
    } else {
      // IDLE PATROL — rovers always keep moving at a slower speed
      const arrived = !this.patrolTarget || this.getDist2D(this.patrolTarget.x, this.patrolTarget.y) < 2;
      if (arrived) {
        this.patrolTarget = this.randomPatrolPoint();
        console.log(`[${this.id}] 🚜 PATROL: Heading to (${this.patrolTarget.x.toFixed(0)}, ${this.patrolTarget.y.toFixed(0)})`);
      }
      if (this.patrolTarget) {
        this.moveTo(this.patrolTarget.x, this.patrolTarget.y);
      }
    }
  }

  private moveTo(tx: number, ty: number) {
    // Rovers move slower than drones (0.02 lerp vs 0.035 for drones)
    this.physicalPos.x += (tx - this.physicalPos.x) * 0.02;
    this.physicalPos.y += (ty - this.physicalPos.y) * 0.02;
    // Z always clamps to terrain
    this.physicalPos.z = this.getTerrainHeight(this.physicalPos.x, this.physicalPos.y);
    this.state.pos = { ...this.physicalPos };
  }

  protected onTaskAssigned(taskId: string, pos: { x: number; y: number; z: number }) {
    super.onTaskAssigned(taskId, pos);
    this.currentTaskId = taskId;
    this.currentMission = { x: pos.x, y: pos.y };
    console.log(`[${this.id}] 🎯 MISSION ASSIGNED: ${taskId} at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
  }
}
