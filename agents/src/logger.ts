/**
 * BAYMAX SAR — Simulation Logger
 * Pipes all console output to a timestamped log file in /logs/
 * Import this at the top of sim-sar-ultimate.ts to enable.
 */
import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDir, `sar-run-${timestamp}.log`);
const stream = fs.createWriteStream(logFile, { flags: 'a' });

const originalLog = console.log.bind(console);
const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

function writeToFile(level: string, ...args: any[]) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.join(' ')}`;
  stream.write(line + '\n');
}

console.log = (...args: any[]) => {
  originalLog(...args);
  writeToFile('LOG', ...args);
};
console.warn = (...args: any[]) => {
  originalWarn(...args);
  writeToFile('WARN', ...args);
};
console.error = (...args: any[]) => {
  originalError(...args);
  writeToFile('ERR', ...args);
};

console.log(`[LOGGER] 📝 Logging to: ${logFile}`);
export {};
