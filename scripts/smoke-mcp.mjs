import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'bin', 'agent-searchkit-mcp');

function encode(message) {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}

function decodeAvailable(buffer) {
  const messages = [];
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) break;
    const header = buffer.slice(0, headerEnd).toString('utf8');
    const match = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
    assert.ok(match, `missing Content-Length header: ${header}`);
    const length = Number.parseInt(match[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) break;
    messages.push(JSON.parse(buffer.slice(bodyStart, bodyEnd).toString('utf8')));
    buffer = buffer.slice(bodyEnd);
  }
  return { messages, buffer };
}

const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
let stdout = Buffer.alloc(0);
let stderr = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { stderr += chunk; });

const responses = [];
child.stdout.on('data', (chunk) => {
  stdout = Buffer.concat([stdout, chunk]);
  const decoded = decodeAvailable(stdout);
  stdout = decoded.buffer;
  responses.push(...decoded.messages);
});

child.stdin.write(encode({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'smoke', version: '0.0.0' } }
}));
child.stdin.write(encode({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
child.stdin.write(encode({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));

await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`timed out waiting for MCP responses. stderr=${stderr}`)), 3000);
  const interval = setInterval(() => {
    if (responses.some((item) => item.id === 1) && responses.some((item) => item.id === 2)) {
      clearInterval(interval);
      clearTimeout(timeout);
      resolve();
    }
  }, 25);
});

child.kill();

const init = responses.find((item) => item.id === 1);
assert.equal(init.result.serverInfo.name, 'agent-searchkit');

const tools = responses.find((item) => item.id === 2).result.tools;
assert.ok(tools.some((tool) => tool.name === 'web_searchkit_search'));
console.log('MCP smoke test passed');
