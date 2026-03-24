import { MqttClient } from 'mqtt';
import type { AgentState } from './types.js';
import { CostFunction } from './cost-function.js';
import EventEmitter from 'events';

interface Bid {
  agentId: string;
  cost: number;
}

export class TaskEngine extends EventEmitter {
  private bids: Map<string, Bid[]> = new Map();
  private activeTasks: Set<string> = new Set();
  private auctionStartTimes: Map<string, number> = new Map();
  
  // High-speed performance tuning: 100ms (clinging to the 30ms fabric speed)
  private readonly AUCTION_WINDOW = 100; 

  constructor(private agentId: string, private client: MqttClient) {
    super();
  }

  /**
   * Starts a high-speed auction for a task.
   * Window: 250ms for sub-500ms decision making.
   */
  public handleTask(taskId: string, targetPos: { x: number; y: number; z: number }, state: AgentState) {
    if (this.activeTasks.has(taskId)) return;
    this.activeTasks.add(taskId);

    // 1. Calculate and publish local bid
    const cost = CostFunction.calculate(state, targetPos);
    const myBid = { agentId: this.agentId, cost };
    this.collectBid(taskId, myBid); // Store own bid locally too

    this.client.publish(`swarm/task/bid/${taskId}/${this.agentId}`, JSON.stringify(myBid));

    // Performance: Record starting time for this auction
    this.auctionStartTimes.set(taskId, performance.now());

    // 2. Resolve in AUCTION_WINDOW ms
    setTimeout(() => this.resolveAuction(taskId, targetPos), this.AUCTION_WINDOW);
  }

  public collectBid(taskId: string, bid: Bid) {
    let taskBids = this.bids.get(taskId);
    if (!taskBids) {
      taskBids = [];
      this.bids.set(taskId, taskBids);
    }
    if (!taskBids.find(b => b.agentId === bid.agentId)) {
      taskBids.push(bid);
    }
  }

  private resolveAuction(taskId: string, targetPos: { x: number; y: number; z: number }) {
    const startTime = this.auctionStartTimes.get(taskId) || 0;
    const delta = startTime ? (performance.now() - startTime).toFixed(1) : 'unknown';

    const taskBids = this.bids.get(taskId) || [];
    if (taskBids.length === 0) {
        this.activeTasks.delete(taskId);
        this.auctionStartTimes.delete(taskId);
        return;
    }

    // Sort by cost ASC (Lowest cost wins)
    taskBids.sort((a, b) => a.cost - b.cost);
    const winner = taskBids[0];
    if (!winner) {
        this.activeTasks.delete(taskId);
        this.auctionStartTimes.delete(taskId);
        return;
    }

    console.log(`[TaskEngine] 🏛️  AUCTION RESOLVED | Task: ${taskId.slice(-4)} | Winner: ${winner.agentId} | Time: ${delta}ms`);
    
    // Emit event if we won
    if (winner.agentId === this.agentId) {
      this.emit('task-assigned', { taskId, pos: targetPos });
    }

    // Task remains in activeTasks for a bit to prevent re-bidding on stale packets
    setTimeout(() => {
        this.bids.delete(taskId);
        this.activeTasks.delete(taskId);
    }, 2000);
  }
}
