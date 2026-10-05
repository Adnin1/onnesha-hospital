---
name: ralph-loop
description: >-
  Autonomous iterative coding loop (Ralph Wiggum Loop) for Antigravity. Use when running unattended
  or AFK coding tasks driven by a PRD or task backlog, executing one task per iteration with clean
  subagent context, automated test verification, and commit cycles until all tasks are green.
---

# Ralph Loop for Antigravity

The **Ralph Loop** is a stateless, iterative orchestration harness that prevents context rot by running coding agents in discrete, bite-sized loops.

## Loop Lifecycle

1. **State Assessment:** Read `PRD.md` (or `tasks.md`) and `progress.txt` to identify the next pending task.
2. **Fresh Context Execution:** Spawn an isolated subagent (`ralph-agent`) dedicated solely to that discrete task.
3. **Verification Gate:** Run the project's test suite (`npm test`, `run-tests.mjs`, or specific unit test).
4. **Autonomous Commit:** When the test suite passes, commit the changes to Git with a structured message.
5. **State Progression:** Append the completed task timestamp and commit hash to `progress.txt`.
6. **Next Iteration:** Repeat steps 1–5 until all tasks in the specification are verified and completed.

## Runner Script

Execute the loop runner:
`node scripts/ralph-loop.mjs --spec=tasks.md --test="node scripts/run-tests.mjs"`
