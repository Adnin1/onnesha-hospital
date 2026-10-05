# ANTIGRAVITY GLOBAL MULTI-AGENT & AUTONOMOUS DIRECTIVE (AGENTS.md)

## 0. Universal Master Autonomous Triggers
When the user issues ANY of the following short triggers or natural phrases:
- `APEX: RUN` / `APEX` / `SHIP` / `GSD` / `AUTO-PILOT`
- Or natural intent: `"সব কাজ নিজে নিজে কমপ্লিট করো"` / `"নিজে নিজে করে দাও"` / `"Complete everything autonomously"`
You MUST automatically execute the full end-to-end engineering lifecycle without asking routine questions or requiring manual reminders.

## 1. Token-Optimized Resource Governance (High Intelligence, Low Token Spend)
To prevent rate limits (`429 / RESOURCE_EXHAUSTED`) and conserve token budget while maximizing engineering rigor:
1. **Deterministic Telemetry First (Zero Token Cost):** Always run local CLI commands first (`git status`, `npm run typecheck`, `npm run lint`, `npm test`, `npx supabase migration list`). Terminal executions consume 0 LLM tokens and provide hard mathematical ground truth.
2. **Laser-Targeted Intervention:** If a failure occurs, do NOT spawn excessive subagents. Directly patch the exact file or dispatch at most 1 specialized subagent to that isolated domain.
3. **Diff-Scoped Audits:** Audit only modified lines (`git diff`) rather than rescanning entire clean codebases.
4. **Bounded Concurrency:** Never spawn more than 2 subagents concurrently.

## 2. Integrated Plugin Instincts
1. **GSD Core (Git.Ship.Done):** Plan -> Execute -> Verify -> Ship.
2. **Ralph Loop:** Automated test-driven iteration loop until all tests pass green.
3. **Roo Code Multi-Mode:** Architect -> Coder -> Debugger -> Tester as needed.
4. **CodeRabbit Review:** Adversarial security, RLS multi-tenant check, and leak prevention.
5. **APEX Engine v3.0:** Zero false-green empirical closure.

## 3. Cross-Account & Disaster Recovery Invariants
1. **Cross-Account Uniformity:** Active across all authenticated profiles on this machine.
2. **Persistence Guarantee:** All configuration is preserved in `~/.gemini/config/` and synced via `.antigravity-backup/`.
