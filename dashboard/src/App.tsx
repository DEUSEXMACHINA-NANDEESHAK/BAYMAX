import React, { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Grid, Environment, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useSwarm, AgentState, SwarmTask } from './hooks/useSwarm';
import {
  ShieldAlert, Battery, ZapOff, Cpu, Terminal,
  Network, AlertTriangle, CheckCircle, Wifi, WifiOff, Play
} from 'lucide-react';

// ─── AGENT NODE (3D) ─────────────────────────────────────────────────────────
function AgentNode({ agent }: { agent: AgentState }) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const glowRef = useRef<THREE.Mesh>(null!);
  const isDead = agent.health === 'DEAD';
  const isDrone = agent.type === 'drone';
  const isAI = agent.type === 'ai-agent';

  const color = isDead ? '#333' : isAI ? '#ff00ff' : isDrone ? '#00f3ff' : '#00ff41';
  const emissive = isDead ? '#000' : color;

  // Pulsing hover animation
  useFrame((state) => {
    if (meshRef.current && !isDead) {
      meshRef.current.rotation.y += isDrone ? 0.03 : 0.01;
      const pulse = Math.sin(state.clock.elapsedTime * 2 + agent.pos.x) * 0.1 + 1;
      if (glowRef.current) glowRef.current.scale.setScalar(pulse);
    }
  });

  const pos: [number, number, number] = [agent.pos.x, agent.pos.z, -agent.pos.y];

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

      {/* Ground circle */}
      {!isDead && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.3, 0]}>
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
    // Sort others by distance
    const sorted = activeAgents
      .filter((_, j) => j !== i)
      .map(b => ({
        b,
        dist: Math.sqrt(Math.pow(a.pos.x - b.pos.x, 2) + Math.pow(a.pos.y - b.pos.y, 2))
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
  const winner = agents.find(a => a.id === task.winnerId);

  useFrame(({ clock }) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += 0.04;
      meshRef.current.rotation.x = Math.sin(clock.elapsedTime * 3) * 0.3;
    }
  });

  const pos: [number, number, number] = [task.pos.x, (task.pos.z || 0) + 0.5, -task.pos.y];

  return (
    <group>
      {/* Threat marker */}
      <mesh ref={meshRef} position={pos}>
        <tetrahedronGeometry args={[0.4]} />
        <meshStandardMaterial color='#ff003c' emissive='#ff003c' emissiveIntensity={3} />
      </mesh>

      {/* Pulse ring */}
      <mesh position={pos} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.6, 0.8, 32]} />
        <meshStandardMaterial color='#ff003c' emissive='#ff003c' emissiveIntensity={1} transparent opacity={0.4} />
      </mesh>

      {/* Mission vector line to winner */}
      {winner && (
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
    </group>
  );
}

// ─── ANIMATED GRID / TERRAIN ──────────────────────────────────────────────────
function AnimatedTerrain() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (ref.current?.material) {
      (ref.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.1 + Math.sin(clock.elapsedTime * 0.5) * 0.05;
    }
  });

  return (
    <>
      <Grid
        args={[100, 100]}
        position={[25, 0, -30]}
        rotation={[0, 0, 0]}
        cellColor='#002222'
        sectionColor='#00f3ff'
        sectionSize={10}
        cellSize={2}
        fadeDistance={100}
        infiniteGrid
      />
      {/* Simulation Bounds (50x60m) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[25, -0.1, -30]}>
        <planeGeometry args={[52, 62]} />
        <meshStandardMaterial color='#00f3ff' emissive='#00f3ff' emissiveIntensity={0.1} transparent opacity={0.05} />
      </mesh>
      {/* Border for simulation bounds */}
      <Line
        points={[[0, 0, 0], [50, 0, 0], [50, 0, -60], [0, 0, -60], [0, 0, 0]]}
        color='#00f3ff'
        lineWidth={2}
        transparent
        opacity={0.3}
      />
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={[25, -0.15, -30]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color='#000505' emissive='#001111' emissiveIntensity={0.1} />
      </mesh>
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
function Scene({ agents, tasks }: { agents: AgentState[]; tasks: SwarmTask[] }) {
  return (
    <>
      <ambientLight intensity={0.1} />
      <pointLight position={[10, 20, 10]} intensity={0.5} color='#00f3ff' />
      <pointLight position={[-10, 10, -10]} intensity={0.3} color='#ff00ff' />
      <AnimatedTerrain />
      <CoordinateMarkers />
      <MeshLinks agents={agents} />
      {agents.map(a => <AgentNode key={a.id} agent={a} />)}
      {tasks.map(t => <ThreatNode key={t.taskId} task={t} agents={agents} />)}
      <OrbitControls makeDefault autoRotate autoRotateSpeed={0.2} enablePan enableZoom />
      <Environment preset='night' />
    </>
  );
}

// ─── AGENT CARD ───────────────────────────────────────────────────────────────
function AgentCard({ agent, onKill, onGpsFail }: {
  agent: AgentState;
  onKill: () => void;
  onGpsFail: () => void;
}) {
  const isDead = agent.health === 'DEAD';
  const isAI = agent.type === 'ai-agent';
  const color = isDead ? '#555' : isAI ? '#ff00ff' : agent.type === 'drone' ? '#00f3ff' : '#00ff41';

  return (
    <div className='agent-card' style={{ borderColor: color + '40' }}>
      <div className='card-top'>
        <span className='agent-id' style={{ color }}>{agent.id}</span>
        <span className={`badge ${isDead ? 'dead' : 'alive'}`}>{agent.health}</span>
      </div>
      <div className='card-info'>
        <div className='info-row'>
          <Battery size={10} style={{ color: agent.battery < 20 ? '#ff003c' : '#aaa' }} />
          <span>{agent.battery.toFixed(0)}%</span>
        </div>
        <div className='info-row'>
          <span className='type-badge'>{agent.type}</span>
        </div>
        <div className='info-row pos'>
          <span>{agent.pos.x.toFixed(1)}, {agent.pos.y.toFixed(1)}</span>
        </div>
      </div>
      {!isDead && (
        <div className='card-actions'>
          <button onClick={onKill} title='Emergency Shutdown' className='btn-danger'><ZapOff size={12} /></button>
          <button onClick={onGpsFail} title='Inject GPS Fail' className='btn-warn'><Cpu size={12} /></button>
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
  const { agents, tasks, events, connected, simStatus, sendCommand } = useSwarm();

  const handleAction = (agentId: string, action: string) => {
    if (action === 'kill') sendCommand('swarm/fault/emergency', { target: agentId });
    if (action === 'fail-gps') sendCommand('swarm/sim/inject/fail', { id: agentId, system: 'gps' });
  };

  return (
    <div className='layout'>
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
          <div className={`conn-pill ${connected ? 'conn-up' : 'conn-down'}`}>
            {connected ? <><CheckCircle size={10} /> LINKED</> : <><WifiOff size={10} /> DOWN</>}
          </div>
        </div>

        {/* Telemetry cards */}
        <div className='section-label'><ShieldAlert size={11} /> LIVE TELEMETRY</div>
        <div className='agent-list'>
          {agents.length === 0 ? (
            <div className='empty-msg'>
              <div className='pulse-dot' />
              Awaiting swarm heartbeats...
            </div>
          ) : (
            agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onKill={() => handleAction(agent.id, 'kill')}
                onGpsFail={() => handleAction(agent.id, 'fail-gps')}
              />
            ))
          )}
        </div>

        {/* Event log */}
        <div className='section-label'><Terminal size={11} /> SECTOR FEED</div>
        <div className='event-log'>
          {events.length === 0 ? (
            <div className='empty-msg'>No events yet...</div>
          ) : events.map(ev => (
            <div key={ev.id} className={`event-row ev-${ev.type}`}>
              <span className='ev-time'>{ev.time}</span>
              <span className='ev-text'>{ev.text}</span>
            </div>
          ))}
        </div>

        {/* Start Simulation button */}
        <button
          className='start-btn'
          onClick={() => sendCommand('swarm/sim/start', { timestamp: Date.now() })}
        >
          <Play size={12} /> START SIMULATION
        </button>

        {/* Emergency button */}
        <button
          className='emergency-btn'
          onClick={() => sendCommand('swarm/fault/emergency', {})}
        >
          ⚠ EMERGENCY FREEZE ALL
        </button>
      </aside>

      {/* 3D viewport */}
      <main className='viewport'>
        <SimStatusOverlay status={simStatus} />
        <NetworkHUD agents={agents} tasks={tasks} connected={connected} />
        <Canvas camera={{ position: [25, 20, 25], fov: 60 }} shadows>
          <Suspense fallback={null}>
            <Scene agents={agents} tasks={tasks} />
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
