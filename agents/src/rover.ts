import { Agent } from './agent.js';

export class Rover extends Agent {
  private currentMission: { x: number; y: number; z: number } | null = null;
  
  constructor(brokerPort = 1883) {
    super('rover', brokerPort);
  }

  protected update() {
    if (!this.currentMission) return;

    const targetX = this.currentMission.x;
    const targetY = this.currentMission.y;
    const targetZ = this.currentMission.z;

    // Move simulation physical position (Smooth 10Hz steps)
    this.physicalPos.x += (targetX - this.physicalPos.x) * 0.05;
    this.physicalPos.y += (targetY - this.physicalPos.y) * 0.05;
    this.physicalPos.z += (targetZ - this.physicalPos.z) * 0.05;
    
    this.state.pos = { ...this.physicalPos };

    // Check for interception completion
    const dist = Math.sqrt(
        Math.pow(targetX - this.state.pos.x, 2) + 
        Math.pow(targetY - this.state.pos.y, 2) +
        Math.pow(targetZ - this.state.pos.z, 2)
    );

    if (dist < 0.5) {
        console.log(`[${this.id}] 🎯 TARGET INTERCEPTED at (${targetX.toFixed(1)}, ${targetY.toFixed(1)})`);
        this.currentMission = null; // Mission accomplished
    }
  }

  public intercept(targetX: number, targetY: number, targetZ: number = 0) {
     this.currentMission = { x: targetX, y: targetY, z: targetZ };
     console.log(`[${this.id}] 🚜 INTERCEPTING: Moving toward (${targetX}, ${targetY}, ${targetZ})`);
  }

  public harvestThreat(x: number, y: number, z: number = 0) {
    const data = {
      id: this.id,
      type: 'threat-detected',
      pos: { x, y, z },
      timestamp: Date.now()
    };
    this.client.publish(`swarm/detection/${this.id}`, JSON.stringify(data));
    console.log(`[${this.id}] 🎯 TARGET HARVESTED at (${x}, ${y}, ${z}) | Broadcasting to AI Agent...`);
  }

  protected onTaskAssigned(taskId: string, pos: { x: number; y: number; z: number }) {
    super.onTaskAssigned(taskId, pos);
    console.log(`[${this.id}] 🚀 MISSION START: Intercepting ${taskId} at (${pos.x}, ${pos.y}, ${pos.z})`);
    this.intercept(pos.x, pos.y, pos.z);
  }
}

