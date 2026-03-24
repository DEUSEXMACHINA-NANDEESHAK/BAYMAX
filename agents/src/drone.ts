import { Agent } from './agent.js';

export class Drone extends Agent {
  constructor(brokerPort = 1883) {
    super('drone', brokerPort);
    
    // Custom Drone Loop: Dynamic Relay positioning
    setInterval(() => this.updateRelayPosition(), 2000);
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
        const midZ = (r1.pos.z + r2.pos.z) / 2;

        console.log(`[${this.id}] 🛰️ RELAY MODE: Closing gap. Moving to midpoint (${midX.toFixed(1)}, ${midY.toFixed(1)}, ${midZ.toFixed(1)})`);
        
        // Move simulation physical position (Slow glide)
        this.physicalPos.x += (midX - this.physicalPos.x) * 0.1;
        this.physicalPos.y += (midY - this.physicalPos.y) * 0.1;
        this.physicalPos.z += (midZ - this.physicalPos.z) * 0.1;
        
        // Update our reported state
        this.state.pos = { ...this.physicalPos };
      }
    }
  }
}
