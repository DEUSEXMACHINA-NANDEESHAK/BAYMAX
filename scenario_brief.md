# BAYMAX — Simulation Scenario Brief
## Vertex Swarm Challenge 2026 — Operation Blackout

---

## ✅ ARE WE ON TRACK? YES — 100%

Your current direction maps **perfectly** to the Hackathon Track 1 "Ghost in the Machine" judging criteria:

| Judging Criterion | What We Have |
|---|---|
| **Innovation** | Partial Failure Isolation + Consensus-validated tasks |
| **Decentralized Logic** | FoxMQ P2P mesh, auction-based task allocation, no central server |
| **Robustness** | 3 failure types: GPS fail, agent death, AI-node shutdown |
| **Developer Clarity** | Live 3D dashboard mirroring the real network topology |

---

## 🧠 THE AI AGENT QUESTION

You are **absolutely right** to challenge this. A single AI agent IS a centralized point of failure.

**Problem**: The current AIAgent is the only one that "verifies" threats. If it dies, the system stalls.

**Solution — Distributed Consensus**: We will re-architect so that **every rover and drone runs its own mini-consensus engine**. When 2+ agents detect the same grid cell, they each independently publish a `verified` task. The [TaskEngine](file:///c:/Users/NANDEESHA.K/Documents/BAYMAX/agents/src/task-engine.ts#11-90) deduplication already handles the rest. The AI Agent becomes **optional telemetry** (publishing proof logs for the judges), not a critical path.

> This is called **Emergent Consensus** — no single node controls verification.

---

## 🎬 THREE SIMULATION SCENARIOS

### 🟢 SCENARIO 1: "SWEEP & RESCUE" — Drone Grid Search
**What it demonstrates**: Coordinated sensor fusion, emergent task allocation.

**The Story**:
> A debris field from a crashed aircraft is scattered across a 40×40m grid. 3 drones systematically sweep the area using a **3-column sweep** pattern. When a drone's sensor detects a ground target, it broadcasts a detection. When **2 drones confirm** the same cell, a Rover is dispatched autonomously via auction.

**Step-by-step**:
1. 3 drones boot up and divide the grid into 3 columns (Column A, B, C)
2. Each drone sweeps its column top-to-bottom, publishing detections
3. When overlap occurs on a cell → consensus → auction fired
4. Nearest rover wins the bid and moves to intercept
5. Rover publishes `TARGET INTERCEPTED` on arrival

**Script**: `sim-sweep-rescue.ts`

---

### 🔴 SCENARIO 2: "DEAD RELAY" — Rover Fault + Handoff Chain
**What it demonstrates**: Partial Failure Isolation, mission handoff, relay-based comms.

**The Story**:
> During a rescue mission, **Rover A's GPS fails** (injected via Dashboard). Rover A cannot continue its mission but remains online as a **relay node**. The swarm detects the mission is stalled, re-auctions the task, and **Rover B** picks it up while routing messages **through** Rover A's degraded radio.

**Step-by-step**:
1. Rover A wins an auction for a distant target (20m away)
2. After 5 seconds, the Dashboard CLI injects a `GPS_FAIL` into Rover A
3. Rover A transitions to `DEGRADED-L` (Location services dead)
4. Rover A stops moving but continues to relay swarm messages
5. Watchdog detects the mission is stalled → re-auction fires
6. Rover B (farther away but healthy) wins the re-auction
7. Rover B intercepts the target routing through Rover A's relay

**Script**: `sim-dead-relay.ts`

---

### 🟡 SCENARIO 3: "BLIND EYE" — Drone GPS Failure + Swarm Heal
**What it demonstrates**: Dynamic fault injection, swarm resilience, self-healing mesh.

**The Story**:
> A drone's GPS is spoofed (simulating an adversarial attack). The Cooperative Trust Mesh (CTM) cross-validates the drone's reported position against RSSI readings and **catches the inconsistency**. The drone is flagged as `DEGRADED-L` and its search column is re-distributed to its two nearest neighbors.

**Step-by-step**:
1. 3 drones are doing a sweep
2. Judges or demo script inject `GPS_FAIL` into Drone B via Dashboard
3. Drone B reports wrong position (its position freezes while others move)
4. CTM cross-check triggers: `MESH ALERT: Agent B is UNRELIABLE`
5. Drone B is flagged and removed from task-bid eligibility
6. Drone A and Drone C each absorb half of Drone B's remaining column
7. Mission continues to completion with **zero human intervention**

**Script**: `sim-blind-eye.ts`

---

## 🗂️ WHAT TO BUILD NEXT

| Priority | Item | Estimated Time |
|---|---|---|
| 1 | Refactor AIAgent → Distributed Consensus in every agent | 30 min |
| 2 | Script for Scenario 1: `sim-sweep-rescue.ts` | 45 min |
| 3 | Script for Scenario 2: `sim-dead-relay.ts` | 30 min |
| 4 | Script for Scenario 3: `sim-blind-eye.ts` | 30 min |
| 5 | Record 90-second competition demo video | 20 min |
