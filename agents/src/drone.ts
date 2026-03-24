import { Agent } from './agent.js';

export class Drone extends Agent {
  // When true, external sim script controls position — relay logic disabled
  public simControlled = false;

  constructor(brokerPort = 1883) {
    super('drone', brokerPort);
  }

  protected update() {
    // If sim script is driving this drone, don't override position
    if (this.simControlled) return;
    this.updateRelayPosition();
  }

  private updateRelayPosition() {
    const activeRovers = Array.from(this.peers.values())
      .filter(p => p.type === 'rover' && (Date.now() - p.timestamp < 5000));

    if (activeRovers.length >= 2) {
      const r1 = activeRovers[0];
      const r2 = activeRovers[1];
      
      if (r1 && r2) {
        const midX = (r1.pos.x + r2.pos.x) / 2;
        const midY = (r1.pos.y + r2.pos.y) / 2;
        const midZ = (r1.pos.z + (r2.pos.z || 0)) / 2 + 5;

        this.physicalPos.x += (midX - this.physicalPos.x) * 0.05;
        this.physicalPos.y += (midY - this.physicalPos.y) * 0.05;
        this.physicalPos.z += (midZ - this.physicalPos.z) * 0.05;
        
        this.state.pos = { ...this.physicalPos };
      }
    }
  }
}
