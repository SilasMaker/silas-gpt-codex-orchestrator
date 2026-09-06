# 验证说明

[English](validation.md) | 简体中文

## 可复现的发布检查

本次发布准备在 macOS 完成：任务记录测试 12 项通过，TypeScript 运行组件构建通过，运行组件 18 个文件内的 171 项测试通过。发布时另行检查 Skill 格式、公开文件和相对链接。

仓库根目录执行：

```sh
python3 -m unittest discover -s tests
```

在 `silas-gpt-codex-orchestrator/runtime/c2c` 中执行：

```sh
pnpm --config.manage-package-manager-versions=false --config.package-manager-strict=false install --frozen-lockfile --ignore-scripts
pnpm --config.manage-package-manager-versions=false --config.package-manager-strict=false build
pnpm --config.manage-package-manager-versions=false --config.package-manager-strict=false test
```

任务记录测试使用隔离项目和模拟回复，验证状态、消息关联、旧计划、证据门等行为，不会连接真实 ChatGPT。运行组件检查包括路径、OAuth、配对、执行记录、只读诊断、进程关闭和 stdio。

## 此前的真实协作测试

2026-09-06，在 macOS Codex 桌面环境使用 ChatGPT Work GPT-6 Astra、官方 Secure MCP Tunnel 和独立任务进度页，完成了规划、重置/撤销功能实现、真实浏览器检查以及 MCP 证据复核。

- 演示应用语法检查及 9 项应用测试通过；桌面/手机操作留下 15 份逐动作记录，3 张视口截图经过目视检查。
- ChatGPT 读取新代码、匹配的执行摘要，并先列出再读取本轮输出，返回 DONE。
- 本地代码与证据检查通过，进入用户体验待验收状态，释放工作区占用并停止本轮隧道。
- 此前还验证了两轮不同文件值读取及客户端重启。

这是一套环境下的历史实测，不能推定所有账号、平台或首次安装都能通过。存储故障使用测试替身；用户视觉体验与工程检查分开。英文说明在该轮实测后补充，没有为翻译重新运行整轮远端对话。

本仓库不包含私人运行日志、凭据、账号配置、会话地址/编号和本机项目路径。独立演示应用未随仓库发布，其 9 项应用测试与本仓库可运行的 12 项任务记录测试、171 项运行组件测试不同。
