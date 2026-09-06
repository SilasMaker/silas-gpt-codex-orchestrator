// A local-only integration exercise. PLAN/DONE are explicit fixtures, not model responses.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = path.join(project, 'silas-gpt-codex-orchestrator');
const runtime = path.join(skill, 'runtime/c2c');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'silas-local-cycle-'));
const workspace = path.join(scratch, 'workspace');
const privateDir = path.join(scratch, 'private');
fs.mkdirSync(workspace); fs.mkdirSync(privateDir, { mode: 0o700 });
const bridgeState = path.join(privateDir, 'bridge');
process.env.C2C_STATE_DIR = bridgeState;
const out = path.join(project, 'docs', `local-test-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), mode: 'LOCAL MCP + SIMULATED GPT',
  realChatGPT: false, browserOAuthPairing: false, publicTunnel: false, scratch, checks: [] };
const ok = (name, details) => report.checks.push({ name, result: 'passed', details });
const write = (file, data) => fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
let state, step = 0, bridge, client;
const thread = `local-test-${path.basename(scratch)}`;
const chat = 'https://chatgpt.com/c/OFFLINE-SIMULATION-local-test';
function journal(action, fields = {}, expectedError) {
  const input = state ? { run_id: state.run_id, thread_id: thread, ...fields } : fields;
  const request = path.join(privateDir, `${++step}-${action}.json`);
  write(request, input);
  const result = spawnSync('python3', [path.join(skill, 'scripts/journal.py'), '--store',
    path.join(privateDir, 'journal'), action, request], { encoding: 'utf8' });
  if (expectedError) {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expectedError);
    return;
  }
  assert.equal(result.status, 0, result.stderr);
  state = JSON.parse(result.stdout);
  return state;
}
function simulated(kind, content) {
  return { chat_url: chat, reply: { run_id: state.run_id,
    reply_to: state.pending.message_id, baseline: state.pending.baseline, kind,
    content: `OFFLINE SIMULATION: ${content}` } };
}
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, JSON.stringify(result.content));
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}
try {
  write(path.join(workspace, 'progress.py'), 'def percent(done, total):\n    return done // total\n');
  write(path.join(workspace, 'test_progress.py'), `import unittest\nfrom progress import percent\nclass Tests(unittest.TestCase):\n def test_normal(self): self.assertEqual(percent(3,4),75)\n def test_empty(self): self.assertEqual(percent(0,0),0)\n def test_complete(self): self.assertEqual(percent(4,4),100)\nif __name__ == '__main__': unittest.main()\n`);
  write(path.join(workspace, '.env'), 'TEST_SECRET=ONLY_A_FAKE_TEST_VALUE\n');
  write(path.join(workspace, '.gitignore'), '__pycache__/\n.env\n');
  assert.equal(spawnSync('git', ['init', '-q', workspace]).status, 0);
  const { startBridge } = await import(pathToFileURL(path.join(runtime, 'dist/bridge/server.js')));
  const { Client } = await import(pathToFileURL(path.join(runtime, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')));
  const { StreamableHTTPClientTransport } = await import(pathToFileURL(path.join(runtime, 'node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js')));
  bridge = await startBridge({ workspaceRoot: workspace, port: 0, persistRuntime: false,
    authStoreFile: path.join(bridgeState, 'auth.json') });
  report.endpoint = bridge.localBaseUrl();
  assert.equal(new URL(report.endpoint).hostname, '127.0.0.1');
  const unauthenticated = await fetch(`${report.endpoint}/mcp`, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) });
  assert.equal(unauthenticated.status, 401);
  ok('未授权读取被拒绝', 'HTTP 401');
  const tokens = bridge.authStore.issueTokens({ clientId: 'local-exercise',
    scopes: ['workspace.read', 'workspace.search', 'git.read', 'execution.read'] });
  client = new Client({ name: 'silas-local-exercise', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${report.endpoint}/mcp`),
    { requestInit: { headers: { authorization: `Bearer ${tokens.accessToken}` } } }));
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 9);
  assert.ok(listed.tools.every(t => t.annotations?.readOnlyHint));
  ok('只读工具完整', listed.tools.map(t => t.name));
  assert.equal((await call('workspace_info')).workspaceId, bridge.workspace.id);
  assert.match((await call('read_file', { path: 'progress.py' })).content, /return done \/\/ total/);
  ok('MCP实际读到本地初始代码');
  for (const target of ['.env', '../private/bridge/auth.json']) {
    const denied = await client.callTool({ name: 'read_file', arguments: { path: target } });
    assert.equal(denied.isError, true);
    assert.ok(!JSON.stringify(denied).includes('ONLY_A_FAKE_TEST_VALUE'));
  }
  ok('敏感文件与越界读取被拒绝');
  journal('init', { workspace, thread_id: thread, chat_url: chat, quality: 'engineering', max_rounds: 6, max_minutes: 10 });
  report.runId = state.run_id;
  journal('queue', { kind: 'INIT', body: 'OFFLINE SIMULATION: 修复任务完成百分比，支持空任务列表，执行三个测试。' });
  const queued = state.pending.message_id;
  journal('status');
  assert.equal(state.pending.message_id, queued);
  journal('queue', { kind: 'INIT', body: 'retry' }, /pending message/);
  ok('重新启动记录工具后保留消息，阻止重复派发');
  const stale = simulated('PLAN', 'Read progress.py and fix percent.');
  fs.appendFileSync(path.join(workspace, 'progress.py'), '\n# another local edit\n');
  journal('receive', stale, /baseline changed/);
  ok('旧代码版本计划被拒绝');
  journal('refresh', { reason: '模拟外部修改，已核对原模拟消息；需要新计划' });
  journal('queue', { kind: 'REPLAN', body: 'OFFLINE SIMULATION: 基于当前文件修复百分比。' });
  journal('receive', stale, /correlation mismatch/);
  ok('迟到的旧回复被拒绝');
  journal('receive', simulated('PLAN', 'Return round(done / total * 100); handle total=0 with 0; verify all three cases.'));
  journal('begin');
  const before = spawnSync('python3', ['-m', 'unittest', '-v'], { cwd: workspace, encoding: 'utf8' });
  assert.notEqual(before.status, 0);
  write(path.join(out, 'before-test.txt'), before.stdout + before.stderr);
  ok('真实运行复现原始计算缺陷');
  write(path.join(workspace, 'progress.py'), 'def percent(done, total):\n    return 0 if total == 0 else round(done / total * 100)\n');
  const after = spawnSync('python3', ['-m', 'unittest', '-v'], { cwd: workspace, encoding: 'utf8' });
  assert.equal(after.status, 0, after.stderr);
  const log = path.join(out, 'after-test.txt');
  write(log, after.stdout + after.stderr);
  ok('实际修改后3个功能测试通过');
  assert.match((await call('read_file', { path: 'progress.py' })).content, /total == 0/);
  ok('MCP重新读取到修改后的代码');
  journal('finish', { report: { checks: [{ name: 'percent function tests', result: 'passed',
    action: 'python3 -m unittest -v', artifact: log }], remaining: [] } });
  const record = spawnSync(process.execPath, [path.join(runtime, 'bin/c2c.js'), 'record', '--workspace', workspace,
    '--task', state.run_id, '--iteration', String(state.rounds), '--tests', '3 passed', '--notes', `baseline=${state.baseline}`,
    '--command', 'python3 -m unittest -v', '--output-file', log, '--exit-code', '0'], { encoding: 'utf8', env: process.env });
  assert.equal(record.status, 0, record.stderr);
  const records = await call('execution_summary');
  const entry = records.records.find(r => r.taskId === state.run_id);
  assert.ok(entry); assert.equal(entry.iteration, state.rounds); assert.ok(entry.notes.includes(state.baseline));
  const output = await call('execution_output', { action: 'read', id: entry.outputId });
  assert.match(output.text, /Ran 3 tests/); assert.equal(output.exitCode, 0);
  write(path.join(out, 'mcp-reviewed-record.json'), { entry, output });
  ok('MCP按任务、轮次与指纹读取真实测试报告');
  journal('queue', { kind: 'REPORT', body: 'OFFLINE SIMULATION: 3 tests passed. Actual local MCP client read source and matching output; no ChatGPT review occurred.' });
  journal('receive', simulated('DONE', 'Fixture review complete; actual source and tests were checked by local client.'));
  assert.equal(state.phase, 'DONE');
  journal('close', { reason: '本次本地工程演练结束，模拟GPT，无真实线上复核' });
  report.finalPhase = state.phase;
  journal('queue', { kind: 'INIT', body: 'repeat closed run' }, /does not own/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(privateDir, 'journal/active.json'))), {});
  ok('任务结束后释放占用，旧任务不能再次执行');
  write(path.join(out, 'journal.json'), state);
  report.success = true;
} catch (error) {
  report.success = false; report.error = error.stack; process.exitCode = 1;
} finally {
  if (client) await client.close();
  if (bridge) {
    await bridge.close();
    let stopped = false;
    try { await fetch(`${report.endpoint}/health`, { signal: AbortSignal.timeout(1500) }); }
    catch { stopped = true; }
    report.localServiceStopped = stopped;
    if (!stopped) { report.success = false; process.exitCode = 1; }
  }
  fs.rmSync(bridgeState, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  write(path.join(out, 'result.json'), report);
  console.log(JSON.stringify({ success: report.success, checks: report.checks.length,
    finalPhase: report.finalPhase, localServiceStopped: report.localServiceStopped, report: path.join(out, 'result.json'), error: report.error }, null, 2));
}
