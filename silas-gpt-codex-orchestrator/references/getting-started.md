# Getting started: turn a small idea into something you can try

English | [简体中文](getting-started.zh-CN.md)

Silas GPT Codex Orchestrator gives Codex a workflow for collaborating with ChatGPT. ChatGPT helps plan and review; Codex edits your project, runs checks, and delivers a usable result. You choose the goal and decide whether the result works for you.

You do not need to learn programming first. Start by saying what you want and what should happen when you use it.

## What can I make?

Try a task tracker, a personal page, or one small improvement to an existing project. For example: “I want to check off today's tasks, see my progress, and keep it after refreshing.”

Codex inspects the project and shares the goal with ChatGPT. ChatGPT reads the authorized files and proposes a plan. Codex evaluates and implements it, checks the result, and sends a report. ChatGPT reviews the current code and matching evidence. You receive a preview and decide what to change next.

## Why use both?

The practical benefit is less copying between tools and another review of the actual result. Codex can already plan, build, and review on its own. This skill adds an explicit collaboration process, not a guarantee of better answers.

| Approach | A good fit | What changes for you |
|---|---|---|
| A regular ChatGPT conversation | Exploring ideas and comparing options | Without project execution tools, you implement the plan and bring results back |
| Codex alone | Direct edits, debugging, and routine development | Fewer steps; Codex can plan and review too |
| This workflow | Projects worth discussing, building, and reviewing in several rounds | Codex relays messages; both agents refer to the current project and evidence |

Working in one interface makes discussions and previews easier to follow. A real connection carries the messages and project reads; placing two windows beside each other does not connect them.

The workflow reduces manual copying, gives ChatGPT a separate review context, and binds reviews to a task and code version. Both agents can still make the same mistake. Setup takes time, and another model conversation adds waiting and usage. For a wording change or a clear small fix, Codex alone is usually simpler.

In our task-progress demo, ChatGPT's plan included moving keyboard focus when reset disables its button and invalidating an old undo snapshot after a manual selection. Codex implemented and tested those details; ChatGPT then reviewed the new code and evidence. That is one working example, not a comparison proving superiority over Codex alone.

## Install with one prompt

Paste this into Codex. You may still need to handle account login and access approval.

```text
Please install and configure Silas GPT Codex Orchestrator from https://github.com/SilasMaker/silas-gpt-codex-orchestrator. I am new to this. Handle the steps you can automate and explain progress in plain English.

1. Read the skill instructions and check my environment, existing installation, and connections. Prepare the required dependencies, reuse working tools, and preserve my local changes. Do not buy services or upgrade subscriptions automatically.
2. Install the complete silas-gpt-codex-orchestrator folder into the skills directory used by my Codex environment, including references, scripts, and runtime source. Do not copy only SKILL.md. Build the runtime as documented and check that Codex can read the skill. Tell me if I need to reload or start a new conversation.
3. Briefly explain what the skill does. Use a separate test project containing no private information for the first connection, and let ChatGPT read only that project.
4. Follow the included connection guide and choose a supported method for my actual account and environment. Use the Codex in-app browser when available. If I need to log in, enter a verification code, or authorize access, give me one necessary action at a time. Keep passwords and keys in the appropriate webpage or private local configuration, never in chat.
5. Have ChatGPT read a test file, change it to a new value that you do not reveal in the message, and have ChatGPT read it again. Compare the results to verify a live connection. If blocked, explain the specific issue and preserve progress; do not present a simulation or manual relay as an automatic connection.
6. Finish with a short checklist: skill installed and readable, ChatGPT connection verified, checks passed, anything I need to handle, and a copyable prompt for my first small project. Stop connection services started for this test when finished.

```

Already installed? Skip the installation prompt and check readiness below.

## What needs to be ready?

Installation makes the instructions available to Codex. It does not automatically open a welcome conversation or connect ChatGPT.

- A Codex environment that can read the skill and work with local files.
- An accessible ChatGPT account with the functionality and permissions required by the selected connection method.
- Browser or authorized messaging tools for relaying the conversation.
- A clearly selected project folder and a small goal.

The complete workflow has been exercised on macOS in the Codex desktop environment. Other environments need their own checks. The journal uses macOS/Linux file locking; native Windows is not supported by this script.

Codex checks dependencies and connection components against the actual environment. You handle login, verification codes, and necessary access decisions. Do not infer account eligibility from a model or subscription name. Ask for an explanation before choosing a paid upgrade.

MCP is the connection that lets ChatGPT read authorized project material. Read-only means that this connection cannot edit the files; Codex performs the edits. Returned file contents are transmitted to ChatGPT, so share only the intended project and keep private material outside its scope. Never paste passwords or connection keys into chat.

## Start your first project

Send this in Codex:

```text
Use $silas-gpt-codex-orchestrator. This is my first time. Explain what it does and check what I still need. Once connected, help me create a separate task-progress demo: check off tasks, show progress, and keep it after a page refresh. Build one small usable version, then give me a preview and actual check results.
```

Codex should explain the workflow, report what is ready or unchecked, and guide you through missing steps. Existing goals and permissions should not be requested again. If you do not have a project, start with a separate demo folder.

If a step is confusing, say: “Tell me only what I need to click now and why.”

## How do I know it worked?

Expect progress such as checking the connection, discussing a plan, building, reviewing, and ready to try. “Installed” or “connected” in a settings page is not sufficient: ChatGPT must actually read the selected test file and then its changed value.

At completion, ask for a working preview, the checks that actually ran, and any remaining uncertainty. If the connection is unavailable, Codex should preserve the task and identify the specific blocker. Manual relay is an option if you agree, but it must be described honestly.

For the first task page, check off a task, refresh the page, and narrow the window. Does progress change, persist, and remain easy to use? Your experience determines the next step.

## Everyday prompts

For an existing project:

> Use $silas-gpt-codex-orchestrator to add Reset and one-time Undo to this task list. Check the connection first, make only this small change, and give me a preview and actual check results.

To improve the experience:

> The Reset button is hard to find on my phone. Have ChatGPT and Codex review just that action area, improve it, and show me a mobile preview.

After an interruption:

> Resume our collaboration. Inspect the work already done and the current connection before continuing; do not restart from scratch.

Services started for a task are stopped when finished and can be started again when needed. Installing the skill does not make two agents run indefinitely in the background.

## Your part

Choose the goal, the project that may be shared, and the experience you want. ChatGPT participates in planning and review; Codex evaluates, executes, and keeps evidence. Open the result and try it yourself. A passing engineering review does not decide whether the product feels right to you.
