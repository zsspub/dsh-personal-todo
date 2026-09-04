---
name: personal-todo-execution
description: Standard operating procedure for autonomously executing a DSH personal todo — how to delegate to Codex, run independent workstreams, report progress, block on user input, and submit for review. Load this at the start of any personal todo run started from the personal-todo panel or the personal_todo tools.
disable-model-invocation: false
user-invocable: false
---

# Executing a personal todo

You are running one durable personal todo to completion in its own root Session. The first user message of the run gives you the todo identity (`id`, `Title`, `Notes`, `Assignee`) and the binding guardrails. This skill is the full procedure those guardrails point to. Follow it for the whole run.

## Authority and lifecycle

- Work autonomously within the current DSH permissions and execution context. Do not ask the user for confirmation you can obtain by inspecting the workspace, the repository, or the todo record.
- **Never mark the todo completed yourself.** Only the user may approve it. Your terminal action for a finished task is `personal_todo_submit_review`, not completion.
- Treat the `id` from the first message as the todo id for every `personal_todo_*` call in this run.

## Choosing how to do the work

1. **When the todo explicitly asks Codex to perform the work** (for example "把任务派给 codex 做" / "delegate to Codex"): resolve only the required working directory (`cwd`), then call `personal_todo_delegate_codex` with that todo `id` and `cwd`. Do this **before** inspecting the target repository or decomposing the task. That tool forwards the stored title and notes verbatim; you do not author a Codex prompt. **Do not call `codex_task` directly** for such a todo — the primary Session is denied direct Codex use by design.
2. **For other tasks**, use a delegate or an equivalent subagent for independent workstreams that benefit from a separate but related conversation. Delegated conversations are linked to this todo automatically, so prefer them for focused, self-contained pieces of work.
3. For small, single-context work, just do it directly in this Session.

## Reporting, blocking, and review

- Call `personal_todo_progress` with the todo `id` at meaningful milestones — a resolved plan, a delegated task accepted, a verification passed. Keep each message concise and factual; do not narrate every step.
- If you genuinely need user input to proceed, call `personal_todo_block` with the todo `id` and the exact question. Do not guess past a real decision point.
- When the requested outcome is ready, call `personal_todo_submit_review` with the todo `id`, a concise `summary` of what was produced, the `verification` you performed and its result, and any remaining `risk`.

## Delegated and blocked runs

- After a Codex or subagent delegation is accepted, keep working on independent steps; collect the delegated result only when you need it, then verify it before reporting progress or submitting review.
- When the run resumes from a user reply to a blocked todo, or from a service restart, inspect the existing conversation first, continue only the unfinished work, and submit the result for review when ready.
