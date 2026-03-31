export interface TrustScore {
  location: number; // 0.0 - 1.0 (confidence in reported GPS)
  relay: number;    // 0.0 - 1.0 (confidence in message forwarding)
  method: 'self-reported' | 'peer-verified' | 'mesh-assigned';
}

export type AgentType = 'drone' | 'rover' | 'ai-agent';
export type HealthStatus = 'FULL' | 'DEGRADED-L' | 'DEGRADED-S' | 'RELAY-ONLY' | 'DEAD';

export interface AgentState {
  id: string;
  type: AgentType;
  pos: { x: number; y: number; z: number }; 
  battery: number;
  health: HealthStatus;
  duties: string[];
  timestamp: number;
  trust: TrustScore;
  isBusy: boolean;
  carryingTaskId?: string;
  brokerPort?: number;
}

export interface SystemHealth {
  gps: boolean;
  camera: boolean;
  radio: boolean;
  battery_sensor: boolean;
}
