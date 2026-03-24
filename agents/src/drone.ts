import { Agent } from './agent.js';

export class Drone extends Agent {
  constructor(brokerPort = 1883) {
    super('drone', brokerPort);
  }

  protected update() {
    this.updateRelayPosition();
  }

  private updateRelayPosition() {
    const activeRovers = Array.from(this.peers.values())
      .filter(p => p.type === 'rover' && (Date.now() - p.timestamp < 5000));

    if (activeRovers.length >= 2) {
      // Find the first two active rovers
      const r1 = activeRovers[0];
      const r2 = activeRovers[1];
      
      if (r1 && r2) {
        const midX = (r1.pos.x + r2.pos.x) / 2;
        const midY = (r1.pos.y + r2.pos.y) / 2;
        const midZ = (r1.pos.z + (r2.pos.z || 0)) / 2 + 5; // Stay 5m above midpoint

        // Move simulation physical position (Fluid 10Hz glide)
        this.physicalPos.x += (midX - this.physicalPos.x) * 0.05;
        this.physicalPos.y += (midY - this.physicalPos.y) * 0.05;
        this.physicalPos.z += (midZ - this.physicalPos.z) * 0.05;
        
        // Update our reported state
        this.state.pos = { ...this.physicalPos };
      }
    }
  }
}
