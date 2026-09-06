import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { endpointFile, writeLastEndpoint } from "../src/config/endpoint.js";
import { writeRuntimeState } from "../src/bridge/runtime.js";
import { SERVICE_NAME, VERSION } from "../src/version.js";
import { Workspace } from "../src/workspace/manager.js";
import { cleanup, makeTmpDir } from "./helpers.js";

it("doctor --no-fix preserves the endpoint and never issues pairing after an address change", async () => {
  const root = makeTmpDir("silas-doctor-workspace");
  const state = makeTmpDir("silas-doctor-state");
  const before = process.env.C2C_STATE_DIR;
  process.env.C2C_STATE_DIR = state;
  const workspace = new Workspace(root);
  let pairCalls = 0;
  let base = "";
  const server = http.createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/mcp") { res.writeHead(401); res.end("{}"); return; }
    if (req.url === "/admin/pairing") {
      pairCalls++;
      res.end(JSON.stringify({ code: "fixture", expiresAt: Date.now() + 10000 }));
      return;
    }
    res.end(JSON.stringify({ service: SERVICE_NAME, version: VERSION, workspaceId: workspace.id,
      workspaceName: workspace.name, workspaceRoot: root, status: "ok", publicUrl: base,
      port: Number(new URL(base).port), tunnel: { running: true, url: base }, tokenCount: 1 }));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    base = `http://127.0.0.1:${port}`;
    writeRuntimeState({ service: SERVICE_NAME, version: VERSION, workspaceId: workspace.id,
      workspaceRoot: root, pid: process.pid, port, adminToken: "fixture", publicUrl: base,
      startedAt: new Date().toISOString() });
    writeLastEndpoint({ workspaceId: workspace.id, port, publicUrl: `${base}/old`, mcpUrl: `${base}/old/mcp` });
    const original = fs.readFileSync(endpointFile(workspace.id), "utf8");
    const cli = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));
    const result = await promisify(execFile)(process.execPath,
      ["--import", "tsx", cli, "doctor", "--workspace", root, "--no-fix", "--json"],
      { cwd: path.resolve(path.dirname(cli), "../.."), env: process.env, timeout: 15000 });
    const report = JSON.parse(result.stdout);
    expect(report.chatgptRepair.connectorAction).toBe("update");
    expect(pairCalls).toBe(0);
    expect(fs.readFileSync(endpointFile(workspace.id), "utf8")).toBe(original);
    expect(report.chatgptRepair.pairingCode).toBeUndefined();
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    if (before === undefined) delete process.env.C2C_STATE_DIR;
    else process.env.C2C_STATE_DIR = before;
    cleanup(root);
    cleanup(state);
  }
});
