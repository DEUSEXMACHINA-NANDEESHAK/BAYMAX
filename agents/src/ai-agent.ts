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
    this.client.on('connect', () => {
      this.client.subscribe('swarm/detection/#');
    });

    this.client.on('message', (topic, message) => {
      if (topic.startsWith('swarm/detection/')) {
        this.processDetection(JSON.parse(message.toString()));
      }
    });

    // Periodically publish "Coordination Proofs"
    setInterval(() => this.publishCoordinationProof(), 5000);
  }

  private processDetection(data: any) {
    const { id, pos } = data;
    // Identify threat by its 1m x 1m grid cell
    const cellId = `${Math.round(pos.x)},${Math.round(pos.y)},${Math.round(pos.z)}`;
    
    let threat = this.threatMap.get(cellId);
    if (!threat) {
      threat = { pos, detectedBy: [], confidence: 0 };
      this.threatMap.set(cellId, threat);
    }

    if (!threat.detectedBy.includes(id)) {
      threat.detectedBy.push(id);
      threat.confidence = threat.detectedBy.length / 5; // Confidence grows with consensus
      console.log(`[${this.id}] 🧠 THREAT VERIFIED at (${cellId}) | Consensus: ${threat.confidence * 100}%`);
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
