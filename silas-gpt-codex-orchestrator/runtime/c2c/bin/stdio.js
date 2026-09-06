#!/usr/bin/env node
import path from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Workspace } from '../dist/workspace/manager.js';
import { createMcpServer } from '../dist/mcp/server.js';
import { nullLogger } from '../dist/logger/index.js';

// The tunnel authenticates callers; this process exposes only the existing
// read-only tools over private stdin/stdout. It does not open an HTTP listener.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--workspace' || !path.isAbsolute(args[1])) {
  console.error('Usage: node bin/stdio.js --workspace /absolute/project/path');
  process.exit(2);
}
try {
  const workspace = new Workspace(args[1]);
  const server = createMcpServer({ workspace, logger: nullLogger });
  await server.connect(new StdioServerTransport());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
