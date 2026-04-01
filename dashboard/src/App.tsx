import React, { Suspense, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Grid, Environment, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useSwarm, AgentState, SwarmTask } from './hooks/useSwarm';
import {
  ShieldAlert, Battery, ZapOff, Cpu, Terminal,
  Network, AlertTriangle, CheckCircle, Wifi, WifiOff, Play
} from 'lucide-react';

// Calculates ground height at (x,y) to sync with Agent.ts and visually track the terrain
const getTerrainHeight = (x: number, y: number) => {
  const lx = x - 25;
  const ly = y - 30;
  return Math.sin(lx * 0.1) * Math.cos(ly * 0.1) * 3 + Math.sin(lx * 0.05) * 1.5;
};

// ─── AGENT NODE (3D) ─────────────────────────────────────────────────────────
function AgentNode({ agent }: { agent: AgentState }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const isDead = agent.health === 'DEAD';
  const isDrone = agent.type === 'drone';
  const isAI = agent.type === 'ai-agent';
  const isCarrying = agent.carryingTaskId;

  const color = isDead ? '#333' : isAI ? '#ff00ff' : isDrone ? '#00f3ff' : isCarrying ? '#ffe100' : '#00ff41';
  const emissive = isDead ? '#000' : color;

  // Pulsing hover animation
  useFrame((state) => {
    if (meshRef.current && !isDead) {
      meshRef.current.rotation.y += isDrone ? 0.03 : 0.01;
      
      // If draining, pulse red at high frequency
      const pulseSpeed = agent.isDraining ? 10 : 2;
      const pulseBase = Math.sin(state.clock.elapsedTime * pulseSpeed + agent.pos.x) * 0.1 + 1;
      
      if (glowRef.current) {
        glowRef.current.scale.setScalar(pulseBase);
        if (agent.isDraining) {
          (glowRef.current.material as THREE.MeshStandardMaterial).color.set('#ff003c');
          (glowRef.current.material as THREE.MeshStandardMaterial).emissive.set('#ff003c');
          (glowRef.current.material as THREE.MeshStandardMaterial).opacity = 0.4 + Math.sin(state.clock.elapsedTime * 15) * 0.2;
        }
      }
    }
  });

  const pos: [number, number, number] = [agent.pos.x, agent.pos.z, -agent.pos.y];
  
  // Calculate ground height at this specific location for accurate tethers/circles
  const groundH = getTerrainHeight(agent.pos.x, agent.pos.y);

  return (
    <group position={pos}>
      {/* Outer glow sphere */}
      {!isDead && (
        <mesh ref={glowRef}>
          <sphereGeometry args={[isDrone ? 0.9 : 1.1, 8, 8]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} transparent opacity={0.08} />
        </mesh>
      )}

      {/* Main body */}
      <mesh ref={meshRef}>
        {isDrone ? <octahedronGeometry args={[0.5]} /> : isAI ? <icosahedronGeometry args={[0.5]} /> : <boxGeometry args={[0.7, 0.3, 1.0]} />}
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={isDead ? 0 : 0.8}
          metalness={0.6}
          roughness={0.2}
        />
      </mesh>

      {/* Elevation Tether (Tracking ground height dynamically) */}
      {!isDead && (isDrone || agent.pos.z > groundH + 0.1) && (
        <Line 
          points={[[0, 0, 0], [0, -(agent.pos.z - groundH), 0]]} 
          color={color} 
          lineWidth={1} 
          transparent 
          opacity={0.2} 
        />
      )}

      {/* Ground circle (Anchored to dynamic terrain height) */}
      {!isDead && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -(agent.pos.z - groundH) + 0.1, 0]}>
          <ringGeometry args={[0.8, 1.0, 32]} />
          <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.4} transparent opacity={0.3} />
        </mesh>
      )}

      {/* Label */}
      <Text
        position={[0, 1.6, 0]}
        fontSize={0.4}
        color={isDead ? '#555' : color}
        anchorX='center'
        anchorY='middle'
        font={undefined}
      >
        {agent.id.toUpperCase().slice(0, 12)}
      </Text>

      {/* Battery bar over head */}
      {!isDead && (
        <mesh position={[0, 1.2, 0]} rotation={[0, 0, 0]}>
          <planeGeometry args={[Math.max(0.05, agent.battery / 100 * 1.5), 0.08]} />
          <meshStandardMaterial color={agent.battery < 20 ? '#ff003c' : '#00ff41'} emissive={agent.battery < 20 ? '#ff003c' : '#00ff41'} emissiveIntensity={1} />
        </mesh>
      )}
    </group>
  );
}

// ─── MESH LINKS (P2P network edges) ──────────────────────────────────────────
function MeshLinks({ agents }: { agents: AgentState[] }) {
  const activeAgents = agents.filter(a => a.health !== 'DEAD');
  const links: Array<[[number,number,number],[number,number,number]]> = [];

  // Connect each agent to its 2 nearest neighbors (P2P mesh topology)
  activeAgents.forEach((a, i) => {
    // Sort others by 3D distance
    const sorted = activeAgents
      .filter((_, j) => j !== i)
      .map(b => ({
        b,
        dist: Math.sqrt(
          Math.pow(a.pos.x - b.pos.x, 2) + 
          Math.pow(a.pos.y - b.pos.y, 2) +
          Math.pow(a.pos.z - (b.pos.z || 0), 2)
        )
      }))
      .sort((x, y) => x.dist - y.dist)
      .slice(0, 2);

    sorted.forEach(({ b }) => {
      links.push([
        [a.pos.x, a.pos.z, -a.pos.y],
        [b.pos.x, b.pos.z, -b.pos.y],
      ]);
    });
  });

  return (
    <>
      {links.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color='#00f3ff'
          lineWidth={0.5}
          transparent
          opacity={0.25}
          dashed
          dashSize={0.3}
          gapSize={0.2}
        />
      ))}
    </>
  );
}

// ─── THREAT TARGET ───────────────────────────────────────────────────────────
function ThreatNode({ task, agents }: { task: SwarmTask; agents: AgentState[] }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const winner = agents.find(a => a.id === task.winnerId && a.health !== 'DEAD');
  const carrier = agents.find(a => a.carryingTaskId === task.taskId && a.health !== 'DEAD');
  const isUnconfirmed = (task as any).status === 'unconfirmed';
  const color = isUnconfirmed ? '#555' : carrier ? '#007bff' : '#ff003c';
  const emissive = isUnconfirmed ? '#222' : color;

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.04;
      meshRef.current.rotation.x = Math.sin(clock.elapsedTime * 3) * 0.3;
    }
  });

  // Calculate ground height if not currently carried
  const groundH = getTerrainHeight(task.pos.x, task.pos.y);
  const pos: [number, number, number] = carrier 
    ? [carrier.pos.x, carrier.pos.z + 0.6, -carrier.pos.y] 
    : [task.pos.x, groundH + 0.5, -task.pos.y];

  return (
    <group>
      {/* Threat marker (Now a sphere/ball) */}
      <mesh ref={meshRef} position={pos}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={isUnconfirmed ? 0.2 : 3} />
      </mesh>

      {/* Pulse ring (Anchored to terrain) */}
      {!carrier && (
        <mesh position={[task.pos.x, groundH + 0.1, -task.pos.y]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.8, 32]} />
          <meshStandardMaterial color='#ff003c' emissive='#ff003c' emissiveIntensity={1} transparent opacity={0.4} />
        </mesh>
      )}

      {/* Mission vector line to winner */}
      {winner && !carrier && (
        <Line
          points={[pos, [winner.pos.x, winner.pos.z, -winner.pos.y]]}
          color='#ff003c'
          lineWidth={1.5}
          transparent
          opacity={0.7}
          dashed
          dashSize={0.4}
          gapSize={0.2}
        />
      )}

      {/* Discovery Label */}
      <Text
        position={[pos[0], pos[1] + 0.8, pos[2]]}
        fontSize={0.3}
        color={color}
        anchorX='center'
      >
        {task.detectedBy ? `SENSE: ${task.detectedBy}` : task.guardian ? `RECOVERY: ${task.guardian}` : 'SOURCE: COMMANDER'}
      </Text>
    </group>
  );
}

function StateLogger({ agents }: { agents: AgentState[] }) {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!isOpen) {
    return (
      <div className="state-logger collapsed" onClick={() => setIsOpen(true)}>
        <Terminal size={14} /> <span>LIVE P2P MIRROR</span>
      </div>
    );
  }

  return (
    <div className="state-logger" onClick={() => setIsOpen(false)}>
      <h3>📡 LIVE P2P STATE MIRROR</h3>
      <div className="log-container">
        {agents.map(a => {
          const callsign = a.id.split('-').slice(1, -1).join('-') || a.id;
          return (
            <div key={a.id} className="log-entry">
              <span className="log-id">[{callsign}]</span>
              <pre>{JSON.stringify({
                type: a.type,
                role: a.duties?.[0] || 'idle',
                battery: `${a.battery.toFixed(0)}%`,
                pos: `(${a.pos.x.toFixed(0)}, ${a.pos.y.toFixed(0)}, ${a.pos.z?.toFixed(1)}m)`
              }, null, 2)}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BaseStation() {
  return (
    <group position={[0, 0, 0]}>
      {/* Search & Rescue Base Marker */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3, 8]} />
        <meshStandardMaterial color="#00f3ff" emissive="#00f3ff" emissiveIntensity={2} />
      </mesh>
      <mesh position={[0, 3, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#00f3ff" emissive="#00f3ff" emissiveIntensity={5} />
      </mesh>
      <Text position={[0, 4, 0]} fontSize={0.7} color="#00f3ff" font={undefined}>
        SAR BASE (0,0)
      </Text>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[2, 2.2, 64]} />
        <meshStandardMaterial color="#00f3ff" emissive="#00f3ff" emissiveIntensity={1} transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function AnimatedTerrain({ onPlaceTask, onPointerMove, onPointerLeave }: { 
  onPlaceTask: (x: number, y: number) => void;
  onPointerMove?: (x: number, y: number, z: number) => void;
  onPointerLeave?: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  
  return (
    <>
      {/* 3D Deformable Ground with Custom Grid lines */}
      <mesh 
        rotation={[-Math.PI / 2, 0, 0]} 
        position={[25, -0.2, -30]}
        onClick={(e) => {
            e.stopPropagation();
            onPlaceTask(e.point.x, -e.point.z);
        }}
        onPointerMove={(e) => {
            e.stopPropagation();
            onPointerMove?.(e.point.x, e.point.y, e.point.z);
        }}
        onPointerLeave={() => onPointerLeave?.()}
      >
        <planeGeometry args={[200, 200, 100, 100]} onUpdate={(self) => {
            const pos = self.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                // Exact same formula as Agent.ts getTerrainHeight
                const h = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 3 + Math.sin(x * 0.05) * 1.5;
                pos.setZ(i, h);
            }
            self.computeVertexNormals();
        }} />
        <meshStandardMaterial 
          color='#051515' 
          emissive='#002222' 
          emissiveIntensity={0.2} 
          roughness={0.8}
        />
      </mesh>

      {/* Wireframe Overlay for on-surface grid lines */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[25, -0.19, -30]}>
        <planeGeometry args={[200, 200, 100, 100]} onUpdate={(self) => {
            const pos = self.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                // Exact same formula as Agent.ts getTerrainHeight
                const h = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 3 + Math.sin(x * 0.05) * 1.5;
                pos.setZ(i, h);
            }
        }} />
        <meshBasicMaterial 
          color='#00f3ff' 
          wireframe 
          transparent 
          opacity={0.1} 
        />
      </mesh>

      <BaseStation />
    </>
  );
}

function CoordinateMarkers() {
  const steps = [0, 10, 20, 30, 40, 50, 60];
  return (
    <>
      {/* X Axis Labels */}
      {steps.filter(s => s <= 50).map(s => (
        <Text key={`x-${s}`} position={[s, 0.1, 1]} rotation={[-Math.PI/2, 0, 0]} fontSize={0.8} color="#00f3ff">
          {s}m
        </Text>
      ))}
      {/* Y Axis Labels (mapped to -Z) */}
      {steps.map(s => (
        <Text key={`y-${s}`} position={[-1, 0.1, -s]} rotation={[-Math.PI/2, 0, 0]} fontSize={0.8} color="#00f3ff">
          {s}m
        </Text>
      ))}
    </>
  );
}

// ─── 3D SCENE ─────────────────────────────────────────────────────────────────
function Scene({ agents, tasks, onPlaceTask, ghostPos, onPointerMove, onPointerLeave, droneQuadrants }: { 
  agents: AgentState[]; 
  tasks: SwarmTask[];
  onPlaceTask: (x: number, y: number) => void;
  ghostPos: [number, number, number] | null;
  onPointerMove: (x: number, y: number, z: number) => void;
  onPointerLeave: () => void;
  droneQuadrants: Map<string, number[]>;
}) {
  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[10, 20, 10]} intensity={0.5} color='#00f3ff' />
      <pointLight position={[-10, 10, -10]} intensity={0.3} color='#ff00ff' />
      <AnimatedTerrain 
        onPlaceTask={onPlaceTask} 
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />
      <CoordinateMarkers />
      <MapQuadrants droneQuadrants={droneQuadrants} />
      <MeshLinks agents={agents} />
      {agents.map(a => <AgentNode key={a.id} agent={a} />)}
      {tasks.map(t => <ThreatNode key={t.taskId} task={t} agents={agents} />)}
      
      {/* Ghost Target Preview */}
      {ghostPos && (
        <mesh position={ghostPos}>
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshStandardMaterial color='#ff003c' transparent opacity={0.6} emissive='#ff003c' emissiveIntensity={2} />
        </mesh>
      )}

      <OrbitControls makeDefault autoRotate autoRotateSpeed={0.2} enablePan enableZoom />
      <Environment preset='night' />
    </>
  );
}

// ─── MAP QUADRANTS (3D visualization of search sectors) ──────────────────────
function MapQuadrants({ droneQuadrants }: { droneQuadrants: Map<string, number[]> }) {
  const quadrants = [
    { id: 1, name: 'Q1', x: 12.5, y: 15,  w: 25, h: 30, color: '#00f3ff' },
    { id: 2, name: 'Q2', x: 37.5, y: 15,  w: 25, h: 30, color: '#ff00ff' },
    { id: 3, name: 'Q3', x: 12.5, y: 45,  w: 25, h: 30, color: '#00ff41' },
    { id: 4, name: 'Q4', x: 37.5, y: 45,  w: 25, h: 30, color: '#ffe100' },
  ];

  return (
    <group>
      {quadrants.map(q => {
        // Find if any drone owns this specific quadrant (using the new array-based check)
        const owner = Array.from(droneQuadrants.entries()).find(([, list]) => list.includes(q.id));
        const callsign = owner ? owner[0].split('-')[1]?.toUpperCase() : null;
        
        return (
          <group key={q.id}>
            {/* Sector Border/Outline */}
            <Line
              points={[
                [q.x - q.w/2, -1.9, -(q.y - q.h/2)],
                [q.x + q.w/2, -1.9, -(q.y - q.h/2)],
                [q.x + q.w/2, -1.9, -(q.y + q.h/2)],
                [q.x - q.w/2, -1.9, -(q.y + q.h/2)],
                [q.x - q.w/2, -1.9, -(q.y - q.h/2)],
              ]}
              color={q.color}
              lineWidth={callsign ? 2 : 1}
              transparent
              opacity={callsign ? 0.4 : 0.1}
            />
            {/* Sector Label */}
            <Text
              position={[q.x, -1.8, -q.y]}
              rotation={[-Math.PI/2, 0, 0]}
              fontSize={3}
              color={q.color}
              anchorX='center'
              anchorY='middle'
              fillOpacity={callsign ? 0.15 : 0.05}
            >
              {q.name}
            </Text>
            {/* Sector Ownership Text */}
            {callsign && (
              <Text
                position={[q.x, -1.7, -q.y + 4]}
                rotation={[-Math.PI/2, 0, 0]}
                fontSize={1.2}
                color={q.color}
                anchorX='center'
                anchorY='middle'
                fillOpacity={0.6}
              >
                {callsign}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ─── AGENT CARD ───────────────────────────────────────────────────────────────
function AgentCard({ agent, onKill, onGpsFail, onDrain }: {
  agent: AgentState;
  onKill: () => void;
  onGpsFail: () => void;
  onDrain: () => void;
}) {
  const isDead = agent.health === 'DEAD';
  const isAI = agent.type === 'ai-agent';
  const color = isDead ? '#555' : isAI ? '#ff00ff' : agent.type === 'drone' ? '#00f3ff' : '#00ff41';

  return (
    <div className={`agent-card ${agent.isDraining ? 'draining-pulse' : ''}`} style={{ borderColor: agent.isDraining ? '#ff003c' : color + '40' }}>
      <div className='card-top'>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span className='agent-id' style={{ color: agent.isDraining ? '#ff003c' : color }}>{agent.id}</span>
          {agent.isDraining && <span className='draining-tag'>⚡ DRAINING</span>}
        </div>
        <span className={`badge ${isDead ? 'dead' : 'alive'}`}>{agent.health}</span>
      </div>
      <div className='card-info'>
        <div className='info-row'>
          <Battery size={10} style={{ color: agent.battery < 20 || agent.isDraining ? '#ff003c' : '#aaa' }} />
          <span style={{ color: agent.isDraining ? '#ff003c' : 'inherit', fontWeight: agent.isDraining ? 'bold' : 'normal' }}>
            {agent.battery.toFixed(0)}%
          </span>
        </div>
        <div className='info-row'>
          <span className='type-badge'>{agent.type}</span>
        </div>
        <div className='info-row pos'>
          <span>{agent.pos.x.toFixed(1)}, {agent.pos.y.toFixed(1)}</span>
        </div>
        {agent.brokerPort && (
          <div className='info-row' style={{ color: '#00f3ff90', fontSize: '9px' }}>
            <Network size={8} /> <span>Node: {agent.brokerPort}</span>
          </div>
        )}
      </div>
      {!isDead && (
        <div className='card-actions'>
          <button onClick={onKill} title='Kill Agent (Test Fallen Comrade)' className='btn-danger'><ZapOff size={12} /></button>
          <button onClick={onGpsFail} title='Inject GPS Failure (Test Degraded Ops)' className='btn-warn'><Cpu size={12} /></button>
          {agent.type === 'drone' && (
            <button 
              onClick={onDrain} 
              title='Drain Battery (Test Blind Handoff)' 
              className='btn-warn' 
              style={{color:'#ff9900'}} 
              disabled={agent.isDraining}
            >
              ⚡
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── NETWORK STATS HUD ───────────────────────────────────────────────────────
function NetworkHUD({ agents, tasks, connected }: { agents: AgentState[]; tasks: SwarmTask[]; connected: boolean }) {
  const alive = agents.filter(a => a.health !== 'DEAD').length;
  const drones = agents.filter(a => a.type === 'drone').length;
  const rovers = agents.filter(a => a.type === 'rover').length;

  return (
    <div className='hud-overlay'>
      <div className='hud-stat'>
        {connected ? <Wifi size={14} className='icon-success' /> : <WifiOff size={14} className='icon-danger' />}
        <span className={connected ? 'val-success' : 'val-danger'}>{connected ? 'LINK UP' : 'OFFLINE'}</span>
      </div>
      <div className='hud-divider' />
      <div className='hud-stat'>
        <Network size={12} className='icon-neon' />
        <span className='val-neon'>{alive} Active</span>
      </div>
      <div className='hud-divider' />
      <div className='hud-stat'>
        <span className='val-ai'>🛸 {drones} Drone{drones !== 1 ? 's' : ''}</span>
      </div>
      <div className='hud-divider' />
      <div className='hud-stat'>
        <span className='val-rover'>🚜 {rovers} Rover{rovers !== 1 ? 's' : ''}</span>
      </div>
      <div className='hud-divider' />
      <div className='hud-stat'>
        <AlertTriangle size={12} className='icon-danger' />
        <span className='val-danger'>{tasks.length} Threats</span>
      </div>
    </div>
  );
}

// ─── SIMULATION STATUS OVERLAY ─────────────────────────────────────────────
function SimStatusOverlay({ status }: { status: { timer: number; message: string } | null }) {
  if (!status || status.timer <= 0) return null;

  return (
    <div className="sim-overlay">
      <div className="sim-timer-ring">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="#00f3ff20" strokeWidth="2" />
          <circle 
            cx="50" cy="50" r="45" fill="none" stroke="#00f3ff" strokeWidth="2" 
            strokeDasharray="283" 
            strokeDashoffset={283 - (status.timer / 10) * 283}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="sim-timer-val">{status.timer}</div>
      </div>
      <div className="sim-msg">{status.message.toUpperCase()}</div>
      <div className="sim-sub">SWARM INITIALIZING... DO NOT INTERRUPT</div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────
export default function App() {
  const { agents, tasks, events, connected, simStatus, meshHealth, droneQuadrants, sendCommand } = useSwarm();
  const [isPlacing, setIsPlacing] = useState(false);
  const [ghostPos, setGhostPos] = useState<[number, number, number] | null>(null);

  const handleAction = (agentId: string, action: string) => {
    if (action === 'kill') sendCommand('swarm/fault/emergency', { target: agentId });
    if (action === 'fail-gps') sendCommand('swarm/sim/inject/fail', { id: agentId, system: 'gps' });
    if (action === 'drain') sendCommand('swarm/sim/inject/fail', { id: agentId, system: 'battery_sensor' });
  };

  const handlePlaceTask = (x: number, y: number) => {
    if (!isPlacing) return;
    const id = `manual-victim-${Math.floor(Math.random() * 1000)}`;
    const h = getTerrainHeight(x, y);
    // Use 'unconfirmed' topic — Drones must fly overhead to verify before Rovers respond
    sendCommand('swarm/task/unconfirmed', {
        taskId: id,
        pos: { x, y, z: h },
        type: 'RESCUE_NEEDED',
        timestamp: Date.now()
    });
    console.log(`[DASHBOARD] 📍 UNCONFIRMED TARGET at (${x.toFixed(1)}, ${y.toFixed(1)}) — awaiting aerial scan`);
    setIsPlacing(false);
    setGhostPos(null);
  };

  const [sideTab, setSideTab] = useState<'swarm' | 'feed' | 'pillars' | 'mesh'>('swarm');

  return (
    <div className='layout'>
      <StateLogger agents={agents} />
      {/* Left sidebar */}
      <aside className='sidebar'>
        {/* Header */}
        <div className='sidebar-header'>
          <div className='logo-row'>
            <div className='logo-icon'>⬡</div>
            <div>
              <h1 className='logo-text'>BAYMAX</h1>
              <div className='logo-sub'>SWARM-OS v2.0.4</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div className={`conn-pill ${connected ? 'conn-up' : 'conn-down'}`}>
              {connected ? <><CheckCircle size={10} /> LINKED</> : <><WifiOff size={10} /> DOWN</>}
            </div>
            <button 
              className="end-mission-btn" 
              onClick={() => sendCommand('swarm/sim/stop', {})}
              title="Terminate Simulation for all Commanders"
            >
              STOP
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '3px', margin: '8px 0', fontSize: '9px' }}>
          {(['swarm','mesh','feed','pillars'] as const).map(t => (
            <button key={t} onClick={() => setSideTab(t)} style={{
              flex: 1, padding: '5px 2px', borderRadius: '4px', cursor: 'pointer',
              border: `1px solid ${sideTab === t ? '#00f3ff' : '#00f3ff20'}`,
              background: sideTab === t ? '#00f3ff15' : 'transparent',
              color: sideTab === t ? '#00f3ff' : '#00f3ff90',
              fontFamily: 'inherit', letterSpacing: '1px', textTransform: 'uppercase'
            }}>
              {t === 'swarm' ? '⬡ SWARM' : t === 'mesh' ? '🔐 MESH' : t === 'feed' ? '🛰️ FEED' : '★ PILLARS'}
            </button>
          ))}
        </div>

        {/* ── TAB: SWARM ─────────────────────────────── */}
        {sideTab === 'swarm' && (<>
          <div className='section-label'><ShieldAlert size={11} /> LIVE TELEMETRY</div>
          <div className='agent-list'>
            {agents.length === 0 ? (
              <div className='empty-msg-container'>
                <div className='empty-msg'>
                  <div className='pulse-dot' />
                  Awaiting swarm heartbeats...
                </div>
                <p style={{ fontSize: '9px', color: '#555', margin: '0 16px 12px', textAlign: 'center' }}>
                  The simulation may be IDLE. Launch the swarm from the tactical hub or click below.
                </p>
                <button 
                  className='start-btn' 
                  style={{ margin: '0 16px 16px', width: 'calc(100% - 32px)' }}
                  onClick={async () => {
                    const API_URL = (import.meta as any).env.VITE_SAR_API_URL || 'https://baymax-sar.zeabur.app/api';
                    try {
                      await fetch(`${API_URL}/sar/start`, { method: 'POST' });
                      console.log('[DASHBOARD] 🚀 Launch command sent to backend');
                    } catch (e) {
                      console.error('[DASHBOARD] Launch failed:', e);
                    }
                  }}
                >
                  🚀 LAUNCH MISSION
                </button>
              </div>
            ) : (
              // SORT: Drones First, then Rovers
              [...agents].sort((a,b) => {
                if (a.type === b.type) return a.id.localeCompare(b.id);
                return a.type === 'drone' ? -1 : 1;
              }).map(agent => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onKill={() => handleAction(agent.id, 'kill')}
                  onGpsFail={() => handleAction(agent.id, 'fail-gps')}
                  onDrain={() => handleAction(agent.id, 'drain')}
                />
              ))
            )}
          </div>
        </>)}

        {/* ── TAB: FEED ───────────────────────────── */}
        {sideTab === 'feed' && (<>
          <div className='section-label'><Terminal size={11} /> SECTOR FEED</div>
          <div className='event-log' style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
            {events.filter(e => 
              !e.text.includes('[MESH]') && !e.text.includes('[P2P]') && !e.text.includes('nodes alive') && 
              !e.text.includes('[SYSTEM]') && !e.text.includes('WAYPOINT') && !e.text.includes('PATROL')
            ).length === 0 ? (
              <div className='empty-msg'>No tactical events...</div>
            ) : (
              events.filter(e => 
                !e.text.includes('[MESH]') && !e.text.includes('[P2P]') && !e.text.includes('nodes alive') && 
                !e.text.includes('[SYSTEM]') && !e.text.includes('WAYPOINT') && !e.text.includes('PATROL')
              ).map(ev => (
                <div key={ev.id} className={`event-row ev-${ev.type}`}>
                  <span className='ev-time'>{ev.time}</span>
                  <span className='ev-text'>{ev.text}</span>
                </div>
              ))
            )}
          </div>
        </>)}

        {/* ── TAB: MESH LOGS ────────────────────────── */}
        {sideTab === 'mesh' && (<>
          <div className='section-label'><Network size={11} /> SYSTEM CONSENSUS</div>
          <div className='event-log' style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 320px)' }}>
            {events.filter(e => 
              e.text.includes('[MESH]') || e.text.includes('[P2P]') || e.text.includes('nodes alive') || 
              e.text.includes('[RELAY]') || e.text.includes('[SYSTEM]') || e.text.includes('WAYPOINT') || e.text.includes('PATROL')
            ).length === 0 ? (
              <div className='empty-msg'>Silent mesh...</div>
            ) : (
              events.filter(e => 
                e.text.includes('[MESH]') || e.text.includes('[P2P]') || e.text.includes('nodes alive') || 
                e.text.includes('[RELAY]') || e.text.includes('[SYSTEM]') || e.text.includes('WAYPOINT') || e.text.includes('PATROL')
              ).map(ev => (
                <div key={ev.id} className={`event-row ev-${ev.type}`}>
                  <span className='ev-time'>{ev.time}</span>
                  <span className='ev-text'>{ev.text}</span>
                </div>
              ))
            )}
          </div>
        </>)}

        {/* ── TAB: PILLARS ───────────────────────────── */}
        {sideTab === 'pillars' && (<>
          <div className='section-label'><AlertTriangle size={11} /> VERTEX PILLARS</div>

          {/* PILLAR 1 */}
          <div style={{ padding: '0 16px 20px' }}>
            <div style={{ 
              background: 'rgba(255, 153, 0, 0.1)', 
              border: '1px solid rgba(255, 153, 0, 0.4)', 
              borderRadius: '6px', 
              padding: '12px', 
              marginBottom: '16px' 
            }}>
              <div style={{ color: '#ff9900', fontWeight: '900', fontSize: '10px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ShieldAlert size={12} /> MISSION PROTOCOL
              </div>
              <p style={{ fontSize: '9px', lineHeight: '1.4', color: '#ff9900cc' }}>
                To preserve autonomous cycles, please <strong>ALWAYS CLICK STOP</strong> before exiting the browser if you have finished your simulation briefing.
              </p>
            </div>
          <div style={{ marginBottom: '8px', padding: '8px', background: '#00f3ff08', borderRadius: '4px', fontSize: '10px' }}>
            <div style={{ color: '#00f3ff', fontWeight: 'bold', marginBottom: '4px' }}>① MESH RESILIENCE (BFT)</div>
            <div style={{color:'#aaa', marginBottom:'4px'}}>Sub-30ms BFT consensus via 4-Node FoxMQ Cluster</div>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #00f3ff10' }}>
              <div>
                <div style={{fontSize:'8px', color:'#555'}}>CLUSTER</div>
                <div style={{color:'#0f0', fontWeight:'bold'}}>4/4 NODES</div>
              </div>
              <div>
                <div style={{fontSize:'8px', color:'#555'}}>BFT STATE</div>
                <div style={{color:'#00f3ff', fontWeight:'bold'}}>CONSENSUS OK</div>
              </div>
            </div>

            {meshHealth ? (
              <div style={{ marginBottom: '8px' }}>
                <div style={{fontSize:'8px', color:'#555', marginBottom: '2px'}}>SWARM HEALTH</div>
                <span style={{ color: '#0f0' }}>{meshHealth.alive}/{meshHealth.total} agents connected</span>
                {' · '}
                <span style={{ color: meshHealth.latency < 20 ? '#0f0' : '#ff0', fontWeight: 'bold' }}>{meshHealth.latency}ms</span>
              </div>
            ) : <div style={{ color: '#555', marginBottom: '8px' }}>Awaiting mesh ping...</div>}

            {/* Cluster Topology Map */}
            <div style={{ fontSize: '8px', color: '#555', marginBottom: '4px', textTransform: 'uppercase' }}>Cluster Topology Map</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
              {[1883, 1884, 1885, 1886].map(port => {
                const count = agents.filter(a => a.brokerPort === port && a.health !== 'DEAD').length;
                return (
                  <div key={port} style={{ 
                    padding: '4px', background: count > 0 ? '#0f01' : '#fff05', 
                    border: `1px solid ${count > 0 ? '#0f04' : '#333'}`, borderRadius: '2px', textAlign: 'center'
                  }}>
                    <div style={{ color: '#888' }}>:{port.toString().slice(-2)}</div>
                    <div style={{ color: count > 0 ? '#0f0' : '#555', fontWeight: 'bold' }}>{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PILLAR 2 */}
          <div style={{ marginBottom: '8px', padding: '8px', background: '#00f3ff08', borderRadius: '4px', fontSize: '10px' }}>
            <div style={{ color: '#00f3ff', fontWeight: 'bold', marginBottom: '4px' }}>② DISTRIBUTED STATE</div>
            <div style={{color:'#aaa', marginBottom:'6px'}}>Quadrant ownership negotiated via FoxMQ consensus</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
              {[1,2,3,4].map(q => {
                // Multi-sector logic: find if any drone's list includes this sector
                const entry = Array.from(droneQuadrants.entries()).find(([, list]) => list.includes(q));
                const callsign = entry ? entry[0].split('-')[1]?.toUpperCase() : null;
                return (
                  <div key={q} style={{
                    padding: '6px', borderRadius: '4px', textAlign: 'center',
                    background: callsign ? '#00f3ff15' : '#ffffff08',
                    border: `1px solid ${callsign ? '#00f3ff50' : '#333'}`,
                    color: callsign ? '#00f3ff' : '#444'
                  }}>
                    <div style={{fontSize:'8px',color:'#555'}}>SECTOR</div>
                    <div style={{fontWeight:'bold'}}>Q{q}</div>
                    <div style={{fontSize:'9px'}}>{callsign ?? '—'}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PILLAR 3 */}
          <div style={{ padding: '8px', background: '#ff990010', border: '1px solid #ff990030', borderRadius: '4px', fontSize: '10px' }}>
            <div style={{ color: '#ff9900', fontWeight: 'bold', marginBottom: '4px' }}>③ BLIND HANDOFF</div>
            <div style={{color:'#aaa', marginBottom:'4px'}}>Air-to-ground relay without cloud services</div>
            <div style={{color:'#777', fontSize:'9px'}}>
              1. Click <span style={{color:'#ff9900'}}>⚡ DRAIN</span> on a drone card (in SWARM tab)<br/>
              2. Drone enters RELAY MODE, hovers<br/>
              3. Its sector goes unpatrolled<br/>
              4. Sector re-negotiated by remaining drones
            </div>
          </div>
        </div>
      </>)}

        {/* Emergency + Spawn — always visible */}
        <button
          className='emergency-btn'
          style={{ marginTop: '8px', width: '100%' }}
          onClick={() => sendCommand('swarm/fault/emergency', {})}
        >
          💀 KILL ALL AGENTS
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
          <button className='start-btn' style={{ fontSize: '9px', backgroundColor: '#00f3ff20' }}
            onClick={() => sendCommand('swarm/sim/spawn', { type: 'drone' })}>
            ➕ SPAWN BIRD
          </button>
          <button className='start-btn' style={{ fontSize: '9px', backgroundColor: '#00ff4120' }}
            onClick={() => sendCommand('swarm/sim/spawn', { type: 'rover' })}>
            ➕ SPAWN BEAST
          </button>
        </div>
        <button
          className='start-btn'
          style={{ width: '100%', marginTop: '8px', fontSize: '10px', backgroundColor: isPlacing ? '#ff003c30' : '#00f3ff15',
            border: `1px solid ${isPlacing ? '#ff003c' : '#00f3ff'}`, color: isPlacing ? '#ff003c' : '#00f3ff' }}
          onClick={() => setIsPlacing(p => !p)}
        >
          {isPlacing ? '✕ CANCEL PLACEMENT' : '📍 PLACE TARGET'}
        </button>
      </aside>

      {/* 3D viewport */}
      <main className='viewport'>
        <SimStatusOverlay status={simStatus} />
        <NetworkHUD agents={agents} tasks={tasks} connected={connected} />
        <Canvas camera={{ position: [25, 20, 25], fov: 60 }} shadows>
          <Suspense fallback={null}>
            <Scene 
              agents={agents} 
              tasks={tasks} 
              onPlaceTask={handlePlaceTask} 
              ghostPos={ghostPos}
              onPointerMove={(x, y, z) => isPlacing && setGhostPos([x, y + 0.5, z])}
              onPointerLeave={() => setGhostPos(null)}
              droneQuadrants={droneQuadrants}
            />
            <EffectComposer>
              <Bloom luminanceThreshold={0.8} intensity={1.2} levels={8} mipmapBlur />
            </EffectComposer>
          </Suspense>
        </Canvas>
        <div className='viewport-label'>
          P2P MESH TOPOLOGY — {agents.filter(a => a.health !== 'DEAD').length} ACTIVE NODES
        </div>
      </main>
    </div>
  );
}
