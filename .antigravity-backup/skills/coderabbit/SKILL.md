---
name: coderabbit
description: >-
  Run AI-powered code reviews, generate pull request summaries, perform security and architectural
  audits using the official CodeRabbit CLI directly inside Antigravity.
---

# CodeRabbit AI Code Review Skill

Use this skill to run pre-commit or pre-merge code reviews using the installed CodeRabbit CLI (`coderabbit` / `cr`).

## CLI Commands

- Review uncommitted/staged changes with structured agent output:
  `coderabbit review --agent`
- Review the entire diff against target branch (e.g., `main`):
  `coderabbit review --base main`
- Output review statistics:
  `coderabbit stats`
- Interactive authentication:
  `coderabbit auth login`

## Execution Invariants

1. Always run `coderabbit review --agent` before committing significant architectural or multi-file changes.
2. Review findings are categorized into `critical`, `warning`, and `nitpick`. All `critical` and `warning` findings must be addressed or explicitly justified before deployment.
