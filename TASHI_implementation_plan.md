# Operation Blackout — Implementation Plan

A **Decentralized Swarm Intelligence Dashboard** for the Vertex Swarm Challenge 2026, Track 1 (Ghost in the Machine).

## What We're Building

11 heterogeneous agents (5 drones + 4 rovers + 2 AI agents) coordinating via FoxMQ/Vertex 2.0 P2P mesh, visualized on a React dashboard with live fault injection and self-healing.

### Key Innovations
- **Partial Failure Isolation (PFI)**: Drones degrade gracefully (GPS fails → relay stays active)
- **Cooperative Trust Mesh (CTM)**: Agents verify each other's capabilities via peer ranging
- **Leaderless Task Auction**: Consensus-based bid/assign with no central orchestrator

## Architecture

```
WEBOTS SIMULATION (optional, Days 10-11)
│
├── 5x Drone Controllers (Python, paho-mqtt)
├── 4x Rover Controllers (Python, paho-mqtt)
│
│    ↕ MQTT (port 1883)
│
├── FOXMQ CLUSTER (4 nodes, Vertex 2.0 BFT)
│   Node-0 ←→ Node-1 ←→ Node-2 ←→ Node-3
│
│    ↕ WebSocket (port 8080)
│
├── 2x AI Agents (Node.js / TypeScript)
│   Threat Analyzer + Coordination Validator
│
│    ↕ WebSocket
│
└── REACT DASHBOARD (TypeScript)
    Live Arena | Mesh Graph | Controls | Proof Log
```

## MQTT Topic Structure

| Topic | Purpose |
|-------|---------|
| `swarm/discovery/<id>` | Agent announces existence |
| `swarm/state/<id>` | Heartbeat (pos, battery, health) every 200ms |
| `swarm/health/<id>` | Health state change events |
| `swarm/map/grid` | Shared explored grid (CRDT) |
| `swarm/detection/<id>` | Threat detection reports |
| `swarm/task/bid/<task-id>` | Rover bidding for tasks |
| `swarm/task/assign/<task-id>` | Consensus winner announced |
| `swarm/relay/request` | Relay drone request |
| `swarm/fault/emergency` | FREEZE signal |
| `swarm/proof/<event-id>` | Signed coordination proofs |

## Proposed Changes (by Phase)

---

### Phase 1: Foundation (Days 1-3)

#### [NEW] Project scaffolding
- `operation-blackout/` root with `agents/`, `dashboard/`, `foxmq-cluster/`, `webots-controllers/`
- FoxMQ cluster setup (binary download + key generation)

#### [NEW] [agents/src/agent.ts](file:///c:/Users/NANDEESHA.K/Music/BAYMAX/operation-blackout/agents/src/agent.ts)
Base agent class with: MQTT connection, heartbeat publishing (200ms), watchdog timer (600ms silence → dead), PFI self-diagnosis, emergency freeze handler.

#### [NEW] [agents/src/test-handshake.ts](file:///c:/Users/NANDEESHA.K/Music/BAYMAX/operation-blackout/agents/src/test-handshake.ts)
Warm-up test: 2 agents connect, exchange state, simulate failure, detect recovery.

---

### Phase 2: Swarm Core (Days 4-6)

#### [NEW] [agents/src/trust.ts](file:///c:/Users/NANDEESHA.K/Music/BAYMAX/operation-blackout/agents/src/trust.ts)
CTM implementation: RSSI simulation, trilateration, per-capability trust scoring.

#### [NEW] [agents/src/drone.ts](file:///c:/Users/NANDEESHA.K/Music/BAYMAX/operation-blackout/agents/src/drone.ts)
Drone specialization: sector sweep, threat detection, relay repositioning.

#### [NEW] [agents/src/rover.ts](file:///c:/Users/NANDEESHA.K/Music/BAYMAX/operation-blackout/agents/src/rover.ts)
Rover specialization: intercept handling, bid scoring.

#### [NEW] [agents/src/ai-agent.ts](file:///c:/Users/NANDEESHA.K/Music/BAYMAX/operation-blackout/agents/src/ai-agent.ts)
Digital agents: threat aggregation, coordination proof generation.

#### [NEW] [agents/src/task-engine.ts](file:///c:/Users/NANDEESHA.K/Music/BAYMAX/operation-blackout/agents/src/task-engine.ts)
Task auction: bid → consensus → assign → re-auction on failure.

---

### Phase 3: Dashboard (Days 7-9)

#### [NEW] `dashboard/` React + TypeScript app
- MQTT WebSocket connection to FoxMQ
- Live agent cards, mesh graph (vis-network), control panel
- Kill/degrade/freeze buttons, task feed, proof log

---

### Phase 4: Webots + Polish (Days 10-12)

#### [NEW] `webots-controllers/` Python controllers
- `drone_controller.py` and `rover_controller.py`
- Connect Webots sensors → FoxMQ via paho-mqtt

---

## Verification Plan

### Automated Tests (per phase)

**Phase 1 (Day 2)**:
```bash
cd operation-blackout/agents
npx ts-node src/test-handshake.ts
```
- Verify: 2 agents connect, heartbeats visible, kill one → other detects death

**Phase 3 (Day 7)**:
```bash
cd operation-blackout/dashboard
npm run dev
```
- Open browser → verify live agent cards updating in real-time

### Manual Verification

1. **FoxMQ cluster**: Run `docker-compose up -d` → check all 4 nodes healthy with `docker ps`
2. **Heartbeat**: Run 2 agent processes → verify terminal shows heartbeat messages
3. **PFI**: Call `agent.failSystem('gps')` → verify agent demotes to DEGRADED-L (not DEAD)
4. **Kill detection**: Ctrl+C one agent → other prints "DECLARED DEAD" within 1.5s
5. **Dashboard**: Open React app → see agents appear, click KILL → watch node go grey
6. **Emergency freeze**: Click FREEZE button → all agents stop heartbeats simultaneously

### Submission Verification
- Warm-Up submission (Day 2): 2-agent handshake + recovery demo
- Track 1 submission (Day 12): Full 11-agent demo with fault injection video

## Interactive Approach

> [!IMPORTANT]
> This project is built **step by step together**. Each step is small, explained, and verified before moving to the next. No bulk code dumps — the developer participates in every decision.
