# Validation

English | [简体中文](validation.zh-CN.md)

## Reproducible package checks

Checked on macOS for this release preparation:

- Python journal tests: **12 passed**.
- TypeScript runtime build: **passed**.
- Runtime tests: **171 passed across 18 files**.
- Skill format, public relative links, and release-file checks are part of publication verification.

From the repository root:

```sh
python3 -m unittest discover -s tests
```

Then, from `silas-gpt-codex-orchestrator/runtime/c2c`:

```sh
pnpm --config.manage-package-manager-versions=false --config.package-manager-strict=false install --frozen-lockfile --ignore-scripts
pnpm --config.manage-package-manager-versions=false --config.package-manager-strict=false build
pnpm --config.manage-package-manager-versions=false --config.package-manager-strict=false test
```

The journal tests use isolated projects and simulated replies. They check state, message correlation, stale plans, evidence gates, and resumption constraints; they do not connect to ChatGPT. Runtime tests cover the bundled bridge and CLI, including paths, OAuth, pairing, records, no-fix diagnostics, process shutdown, and stdio.

## Historical live workflow

A separate local task-progress demo was used on 2026-09-06 in macOS Codex desktop with ChatGPT Work GPT-6 Astra and an official Secure MCP Tunnel.

1. ChatGPT read the real project and proposed a small Reset/Undo change.
2. Codex implemented it and ran syntax checks, 9 actual application tests, and desktop/mobile interaction checks with 15 recorded observations.
3. Three viewport screenshots were visually inspected. Storage failures were exercised with test doubles, not browser permission changes.
4. ChatGPT read the new code, the matching execution summary, and a listed execution output through MCP, then returned DONE for that task and baseline.
5. The local source/evidence gate accepted the result as READY_FOR_USER_REVIEW. Workspace ownership was released and the owned tunnel was stopped; the preview remained available.

A preceding connection test used two different file values and a client restart to distinguish fresh remote reading from a cached response. This is historical evidence of one environment, not proof that all accounts, platforms, or first-install experiences work. User acceptance of the visual experience was separate from engineering review. The English documentation was added after that live run; the full conversation was not repeated merely to translate the package.

Private run logs, credentials, account configuration, conversation URLs/IDs, and local project paths are intentionally absent from this repository. The demo application is not included; its 9 application tests are not the 12 journal tests or 171 runtime tests available here.
