import { Agent } from './agent.js';

export class Rover extends Agent {
  constructor(brokerPort = 1883) {
    super('rover', brokerPort);
  }

  // Rover specific logic can go here (e.g. specialized obstacle avoidance)
  public intercept(targetX: number, targetY: number, targetZ: number = 0) {
    console.log(`[${this.id}] 🚜 INTERCEPTING: Moving toward (${targetX}, ${targetY}, ${targetZ})`);
    
    // Move simulation physical position (Fast ground speed)
    this.physicalPos.x += (targetX - this.physicalPos.x) * 0.2;
    this.physicalPos.y += (targetY - this.physicalPos.y) * 0.2;
    this.physicalPos.z += (targetZ - this.physicalPos.z) * 0.2;
    
    this.state.pos = { ...this.physicalPos };
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
}

