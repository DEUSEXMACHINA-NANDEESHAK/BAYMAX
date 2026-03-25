import type { AgentState } from './types.js';

export class CostFunction {
  /**
   * Calculates the cost for an agent to handle a specific 3D task.
   * Lower cost = Higher priority.
   */
  static calculate(state: AgentState, target: { x: number; y: number; z: number }): number {
    const dx = state.pos.x - target.x;
    const dy = state.pos.y - target.y;
    const dz = state.pos.z - target.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // 1. Battery Tax (1.5x multiplier to preserve low-power units)
    const batteryComponent = (100 - state.battery) * 1.5;
    
    // 2. Health Tax (Penalize degraded hardware)
    let healthTax = 0;
    if (state.health === 'DEGRADED-L') healthTax = 50;
    if (state.health === 'RELAY-ONLY') healthTax = 500;
    if (state.health === 'DEAD') healthTax = 10000;

    // 3. 3D Tactical Priority
    const isAerial = target.z > 2.0;
    let rolePenalty = 0;

    if (isAerial) {
      // Drones are much better for aerial targets
      rolePenalty = state.type === 'drone' ? 0 : 800; 
    } else {
      // Rovers are better for ground targets
      // Drones should NEVER bid for ground-based rescue if rovers are available
      rolePenalty = state.type === 'rover' ? 0 : 99999; 
    }

    // 4. Mission Status Tax (Don't double-book agents!)
    const busyTax = state.isBusy ? 2000 : 0;

    const totalCost = distance + batteryComponent + healthTax + rolePenalty + busyTax;
    return Math.round(totalCost * 10) / 10;
  }
}
