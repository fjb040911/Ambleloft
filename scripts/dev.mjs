import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import electron from 'electron';

const server = await createServer();
await server.listen();
server.printUrls();
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, ATELIER_DEV: '1' } });
const close = async () => { child.kill(); await server.close(); };
process.on('SIGINT', close);
process.on('SIGTERM', close);
child.on('exit', async (code) => { await server.close(); process.exit(code ?? 0); });
