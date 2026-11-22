// `npm run dev` -> local API (port 3001) + Vite dev server (port 5173, proxies /api to 3001)
import { spawn } from 'node:child_process';
import { startApi } from './dev-api.js';

await startApi(Number(process.env.API_PORT || 3001));
console.log('API  -> http://localhost:3001');
//const vite = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite'], { stdio: 'inherit' });
const vite = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite'],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  }
);
vite.on('exit', (code) => process.exit(code ?? 0));
