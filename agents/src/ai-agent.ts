import { Agent } from './agent.js';

interface Threat {
  pos: { x: number; y: number; z: number };
  detectedBy: string[];
  confidence: number;
}

export class AIAgent extends Agent {
  private threatMap: Map<string, Threat> = new Map();

  constructor(brokerPort = 1883) {
    super('ai-agent', brokerPort);
    this.isDigital = true; 
    
    // AI Agents are digital-only, set physical position to "The Cloud"
    this.physicalPos = { x: 0, y: 0, z: 100 }; 
    
    // Listen to all detections
    const sub = () => {
      this.client.subscribe('swarm/detection/#');
      console.log(`[${this.id}] 🧠 Listening for swarm detections...`);
    };

    if (this.client.connected) sub();
    else this.client.on('connect', sub);

    // Periodically publish "Coordination Proofs"
    setInterval(() => this.publishCoordinationProof(), 5000);
  }

  protected onMessage(topic: string, payload: string) {
    // ALWAYS call super to handle kill/diagnose/etc.
    super.onMessage(topic, payload);

    if (topic.startsWith('swarm/detection/')) {
        this.processDetection(JSON.parse(payload));
    }
  }

  private processDetection(data: any) {
    const { id, pos } = data;
    // Identify threat by its 1m x 1m grid cell
    const cellId = `${Math.round(pos.x)}_${Math.round(pos.y)}_${Math.round(pos.z)}`;
    
    let threat = this.threatMap.get(cellId);
    if (!threat) {
      threat = { pos, detectedBy: [], confidence: 0 };
      this.threatMap.set(cellId, threat);
    }

    if (!threat.detectedBy.includes(id)) {
      threat.detectedBy.push(id);
      threat.confidence = threat.detectedBy.length / 5; // Confidence grows with consensus
      console.log(`[${this.id}] 🧠 THREAT VERIFIED at (${cellId}) | Consensus: ${threat.confidence * 100}%`);

      // NEW: Trigger Auction if 2+ agents agree (40% confidence)
      if (threat.confidence >= 0.4) {
          this.client.publish('swarm/task/verified', JSON.stringify({
              taskId: `task-${cellId}`,
              pos: pos,
              type: 'INTERCEPT'
          }));
      }
    }
  }

  private publishCoordinationProof() {
    const proof = {
      timestamp: Date.now(),
      swarmSize: this.peers.size + 1,
      healthCheck: Array.from(this.peers.values()).every(p => p.health === 'FULL'),
      activeThreats: this.threatMap.size,
      signature: "AI-VERIFIED-CONSENSUS"
    };

    this.client.publish('swarm/proof/consensus', JSON.stringify(proof));
    console.log(`[${this.id}] 📜 PROOF GENERATED: Swarm Size ${proof.swarmSize} | Health: ${proof.healthCheck ? 'OPTIMAL' : 'DEGRADED'}`);
  }
}

// Start immediately if run directly
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    new AIAgent();
}
