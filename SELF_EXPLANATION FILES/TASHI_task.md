# Operation Blackout — Task Checklist

## Phase 1: Foundation (Days 1-3)

### Day 1 — Environment Setup
- [ ] Create project folder structure (`operation-blackout/`)
- [ ] Download FoxMQ binary for Windows
- [ ] Generate cluster keys + address book
- [ ] Create FoxMQ user (swarm / blackout123)
- [ ] Start a single FoxMQ node and verify it runs
- [ ] Initialize `agents/` Node.js project (npm init, install mqtt, typescript)
- [ ] Write first test: connect to FoxMQ from TypeScript

### Day 2 — Heartbeat + Watchdog
- [ ] Write base `agent.ts` class (connect, publish heartbeat, subscribe)
- [ ] Add watchdog timer (detect 600ms silence → declare dead)
- [ ] Write `test-handshake.ts` — 2 agents discover + sync state
- [ ] Test: kill agent A → agent B declares it dead
- [ ] **WARM-UP SUBMISSION READY**

### Day 3 — Partial Failure Isolation (PFI)
- [ ] Add `SystemHealth` interface to agent
- [ ] Add `selfDiagnose()` — per-system health check
- [ ] Add `failSystem()` — simulate GPS/camera/radio failures
- [ ] Test all health states: FULL → DEGRADED-L → RELAY-ONLY → DEAD
- [ ] Publish health change events to `swarm/health/#`

## Phase 2: Swarm Core (Days 4-6)

### Day 4 — Cooperative Trust Mesh (CTM)
- [ ] Add TrustScore interface (location, relay, detection scores)
- [ ] Add RSSI simulation (signal strength between agents)
- [ ] Add trilateration function (3 peers → estimated position)
- [ ] Add packet delivery rate tracking for relay trust
- [ ] Add mesh-assigned positioning fallback

### Day 5 — Drone + Rover Specialization
- [ ] Create `drone.ts` — sector sweep, threat detection, relay logic
- [ ] Create `rover.ts` — intercept handling, proximity scoring
- [ ] Create `ai-agent.ts` — threat aggregation, proof generation
- [ ] Test 3 different agent types running simultaneously

### Day 6 — Task Negotiation Engine
- [ ] Build task auction system (bid → consensus → assign)
- [ ] Threat detected → rovers bid → winner assigned
- [ ] Re-auction when assigned rover dies mid-task
- [ ] Test: drop threat → watch rovers bid → one wins

## Phase 3: Dashboard (Days 7-9)

### Day 7 — React Dashboard Setup
- [ ] Create React + TypeScript project
- [ ] Connect to FoxMQ via WebSocket (mqtt.js)
- [ ] Show live agent cards (id, type, battery, health)
- [ ] Real-time state updates from MQTT subscriptions

### Day 8 — Live Mesh Graph
- [ ] Add vis-network or react-force-graph component
- [ ] Nodes = agents (color by health state)
- [ ] Edges = active P2P connections
- [ ] Animate heartbeats, grey out dead nodes

### Day 9 — Control Panel + Fault Injection
- [ ] Add KILL button per agent
- [ ] Add FAIL GPS / FAIL CAMERA buttons
- [ ] Add EMERGENCY FREEZE big red button
- [ ] Add task feed panel + proof of coordination log

## Phase 4: Webots + Polish (Days 10-12)

### Day 10 — Webots Setup + First Robot
- [ ] Install Webots
- [ ] Create arena (obstacles, grid)
- [ ] Add one e-puck rover, write Python controller
- [ ] Connect Webots robot to FoxMQ via paho-mqtt

### Day 11 — Full Fleet in Webots
- [ ] Add 5 drones + 4 rovers to Webots arena
- [ ] Each with Python controller → FoxMQ
- [ ] Dashboard shows all 11 agents from Webots
- [ ] Test fault injection with Webots robots

### Day 12 — Polish + Demo Video + Submit
- [ ] Fix remaining bugs
- [ ] Clean repo (README, architecture diagram, comments)
- [ ] Record 90-second demo video
- [ ] Submit on DoraHacks
- [ ] Ping Discord #vertex-hackathon
