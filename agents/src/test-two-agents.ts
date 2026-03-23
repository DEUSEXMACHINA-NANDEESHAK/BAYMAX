import { Agent } from './agent.js';

const drone1 = new Agent('drone', 1883); 
const drone2 = new Agent('drone', 1883);
const rover1 = new Agent('rover', 1883);

console.log("🚀 Swarm starting. Waiting for 10s discovery...");

setTimeout(() => {
  console.log("\n--- 🚨 SIMULATING GPS SPOOFING: drone1 is now lying! ---");
  // Change the REPORTED position to be 500 meters away
  drone1.state.pos = { x: 500, y: 500 }; 
}, 10000);

setInterval(() => {}, 1000);
