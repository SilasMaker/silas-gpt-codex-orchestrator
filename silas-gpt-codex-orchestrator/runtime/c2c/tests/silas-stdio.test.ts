import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = path.resolve('bin/stdio.js');

it('requires an explicit absolute workspace before starting', () => {
  for (const args of [[], ['--workspace', '.']]) {
    const result = spawnSync(process.execPath, [entry, ...args], { encoding: 'utf8' });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
  }
});

it('reads fresh values through the real process while preserving path and secret boundaries', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'silas-stdio-'));
  const root = path.join(temp, 'workspace with spaces');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'probe.txt'), 'first');
  fs.writeFileSync(path.join(root, '.env'), 'fixture-secret');
  fs.writeFileSync(path.join(temp, 'outside.txt'), 'outside-fixture');
  fs.symlinkSync(path.join(temp, 'outside.txt'), path.join(root, 'outside-link.txt'));
  const client = new Client({ name: 'stdio-test', version: '1' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [entry, '--workspace', root], stderr: 'pipe' }));
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    expect(tools.every(tool => tool.annotations?.readOnlyHint === true)).toBe(true);
    const read = (file: string) => client.callTool({ name: 'read_file', arguments: { path: file } });
    expect(JSON.stringify(await read('probe.txt'))).toContain('first');
    fs.writeFileSync(path.join(root, 'probe.txt'), 'second');
    expect(JSON.stringify(await read('probe.txt'))).toContain('second');
    for (const file of ['../outside.txt', 'outside-link.txt', '.env']) {
      const result = await read(file);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain('fixture-secret');
      expect(JSON.stringify(result)).not.toContain('outside-fixture');
    }
  } finally {
    await client.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
