---
name: roo-code-nightly
description: >-
  Roo Code Nightly multi-mode autonomous workflows for Antigravity. Use when switching between
  specialized agent roles: Architect mode (system design), Code mode (feature implementation),
  Debug mode (root-cause analysis), Test mode (TDD / test writing), and Review mode.
---

# Roo Code Nightly — Multi-Mode Workflows for Antigravity

This skill enables Roo Code's multi-mode cognitive workflows directly inside Antigravity.

## Operating Modes

1. **ARCHITECT Mode:**
   - Focus: High-level design, ADRs, schema planning, and system boundaries.
   - Constraint: Read-only analysis. Drafts technical specifications and action plans before code changes.
   - Dispatch: Invoke subagent `roo-architect`.

2. **CODE Mode:**
   - Focus: High-velocity execution, writing features, refactoring components.
   - Constraint: Implements strictly according to the architectural design and maintains zero lint errors.

3. **DEBUG Mode:**
   - Focus: Root-cause analysis, diagnosing crash dumps, fixing runtime errors.
   - Constraint: Locates failing lines, crafts reproducer tests, and verifies fixes with minimal blast radius.
   - Dispatch: Invoke subagent `roo-debugger`.

4. **TEST Mode:**
   - Focus: Test-driven development (TDD), boundary condition testing, integration test coverage.
   - Constraint: Ensures zero false-green passes and 100% assertions on edge cases.

5. **REVIEW Mode:**
   - Focus: CodeRabbit-style adversarial inspection, security audits, and PR summaries.
