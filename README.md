# ⬡ BAYMAX: SEARCH & RESCUE SWARM

[This is AI-GENERATED DOCUMENT. Might not be 100% Accurate, but it gets the job done..!]

LIVE AT: nandeeshak.com/sar/demo

## 🌌 The Mission

**BAYMAX** is a high-resilience, decentralized autonomous swarm orchestration system designed for Search & Rescue (SAR) operations in extreme environments. Built on a foundation of **Byzantine Fault Tolerance (BFT)** and real-time 3D telemetry, it coordinates "Birds" (Aerial Drones) and "Beasts" (Gsround Rovers) to find and recover survivors with zero single-point-of-failure.

---

## 🛡️ Core Pillars

### 1. Mesh Resilience (BFT)

The swarm operates on a **4-Node FoxMQ Cluster** providing sub-30ms P2P messaging latency. Even if multiple broker nodes fail, the swarm maintains state consensus, preventing "ghost" agents and ensuring mission continuity.

### 2. 3D Tactical HUD

A Vite-powered, WebGL-accelerated Command & Control interface built with **React-Three-Fiber**. It provides:

- **Live P2P State Mirroring**: Real-time position tracking across the mesh.
- **Dynamic Terrain Mapping**: Visualizing the search area with elevation tethers.
- **Sector Ownership**: Visual quadrants assigned to specific drones for efficient coverage.

### 3. Collaborative Autonomy

- **Aerial Verification**: Drones ("Birds") scan unconfirmed targets.
- **Ground Handoff**: Once verified, Rovers ("Beasts") are autonomously dispatched for recovery.
- **Battery Blind Handoff**: Intelligent power management where fading drones hand off their sectors to active neighbors.

---

## 🛠️ Tech Stack

| Layer              | Technologies                                                |
| :----------------- | :---------------------------------------------------------- |
| **Frontend HUD**   | React 19, Vite, Three.js, TailwindCSS, Lucide Icons         |
| **Swarm Logic**    | Node.js, TypeScript, MQTT (paho/paho-mqtt)                  |
| **Infrastructure** | FoxMQ Cluster (P2P MQTT Broker)                             |
| **Deployment**     | Docker (Backend Services), PowerShell (Local Orchestration) |

---

## 🚀 Quick Start (Tactical Deployment)

### Prerequisites

- Node.js v18+
- PowerShell (for master launch scripts)
- FoxMQ (Included in `foxmq-cluster/`)

### Launch Routine

1.  **Start the FoxMQ Mesh**:
    Run the cluster in a separate terminal:
    ```powershell
    cd foxmq-cluster
    .\launch-foxmq-cluster.ps1
    ```
2.  **Deploy Swarm & HUD**:
    In the root directory, run the master launcher:
    ```powershell
    .\launch-sar.ps1
    ```
3.  **Access Station**:[Certain URLs have been hardcoded. I have also pushed the Credentials for the FOX-MQ Broker Also users.toml. Please bear with caution]
    Open [http://localhost:5173](http://localhost:5173) to view the 3D HUD.

---

## 🎮 Tactical HUD Controls

| Action            | Description                                             |
| :---------------- | :------------------------------------------------------ |
| **Click Map**     | Drop an "Unconfirmed Target" for the swarm to scan.     |
| **Kill Agent**    | Simulate a terminal failure (test BFT resilience).      |
| **GPS Fail**      | Inject position drift to test degraded mode navigation. |
| **Battery Drain** | Force an immediate sector handoff simulation.           |
| **Stop Mission**  | Gracefully terminate all autonomous cycles.             |

---

## 📂 Project Structure

- `agents/`: The brains of the swarm (Drone & Rover logic).
- `dashboard/`: React/Three.js frontend HUD.
- `foxmq-cluster/`: Distributed MQTT broker configuration.
- `baymax-sar-service/`: Core backend coordinating the SAR workflow.
- `knight-gambit/`: Extended client/server modules for node-chaos simulations.

---

## 📧 Author

**Nandeesha K**
