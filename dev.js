/**
 * dev.js — Start backend and frontend dev servers concurrently.
 *
 * Usage:  node dev.js
 */
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const ROOT = __dirname;
const BACKEND_DIR = join(ROOT, 'backend');
const FRONTEND_DIR = join(ROOT, 'frontend');

const procs = [];

function start(label, cmd, args, cwd) {
  const proc = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  proc.on('error', (err) => console.error(`[${label}] error:`, err.message));
  proc.on('exit', (code, signal) => {
    console.log(`[${label}] exited (code=${code}, signal=${signal})`);
  });
  procs.push(proc);
  return proc;
}

// Start both — backend first (frontend may want to reach it)
start('backend',  'npx', ['tsx', 'watch', 'src/index.ts'], BACKEND_DIR);
start('frontend', 'npm', ['run', 'dev'],                  FRONTEND_DIR);

// Graceful shutdown — forward SIGINT/SIGTERM to children
function shutdown() {
  for (const p of procs) {
    if (!p.killed) p.kill('SIGTERM');
  }
  setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('\n  Dev servers starting…\n');
