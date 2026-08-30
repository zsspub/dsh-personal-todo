/** Todo-to-Session orchestration over the Host's ordinary Session service. */

import { randomUUID } from 'node:crypto'
import type {
  ReplyTodoRequest, RequestTodoChangesRequest, Todo,
} from '../types.ts'
import { PersonalTodoError, TodoStore } from './store.ts'

interface TodoAgent {
  readonly id: string
  readonly status: 'idle' | 'running'
  followup(message: {
    readonly id: string
    readonly role: 'user'
    readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
    readonly source: { readonly kind: 'user' }
  }): void
}

/** Minimum Host Session API consumed by the standalone plugin. */
export interface TodoSessionController {
  create(request: {
    readonly sessionId: string
    readonly agentPreset?: string
  }): Promise<{ readonly sessionId: string }>
  resolveAgent(sessionId: string): Promise<
    { readonly agent: TodoAgent }
    | { readonly error: { readonly message: string } }
  >
}

interface TodoOrchestratorConfig {
  readonly agentPreset?: string
}

function taskPrompt(todo: Todo): string {
  const notes = todo.notes === null ? 'No additional notes.' : todo.notes
  return [
    `Execute personal todo ${todo.id}.`,
    `Title: ${todo.title}`,
    `Notes: ${notes}`,
    '',
    'Work autonomously within the current DSH permissions and execution context.',
    'When the delegate tool or an equivalent subagent tool is available, use it for independent workstreams that benefit from separate related conversations; delegated conversations are linked to this todo automatically.',
    `Use personal_todo_progress with id ${todo.id} for meaningful milestones.`,
    `If user input is required, call personal_todo_block with id ${todo.id} and the exact question.`,
    `When the requested outcome is ready, call personal_todo_submit_review with id ${todo.id}, a concise summary, verification performed, and remaining risks.`,
    'Do not mark the todo completed; only the user may approve it.',
  ].join('\n')
}

function replyPrompt(todoId: string, message: string): string {
  return `The user replied to the blocked personal todo ${todoId}:\n\n${message}\n\nContinue the task and submit it for review when ready.`
}

function changesPrompt(todoId: string, feedback: string): string {
  return `The user requested changes for personal todo ${todoId}:\n\n${feedback}\n\nApply the feedback, report meaningful progress, and submit a new review when ready.`
}

function recoveryPrompt(todoId: string): string {
  return `Resume personal todo ${todoId} after the DSH service restart. Inspect the existing conversation before acting, continue only unfinished work, and submit the result for review when ready.`
}

/** Starts and resumes the one ordinary root Session owned by each todo. */
export class TodoOrchestrator {
  constructor(
    private readonly store: TodoStore,
    private readonly sessions: TodoSessionController,
    private readonly config: TodoOrchestratorConfig,
  ) {}

  private async deliver(sessionId: string, text: string): Promise<void> {
    const resolved = await this.sessions.resolveAgent(sessionId)
    if ('error' in resolved) throw new PersonalTodoError(resolved.error.message)
    resolved.agent.followup({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    })
  }

  /** Resume durable in-progress runs whose Agents are not already active. */
  async recover(signal: AbortSignal): Promise<void> {
    for (const todo of this.store.recoverableTodos()) {
      signal.throwIfAborted()
      const sessionId = todo.primarySessionId as string
      const runId = todo.activeRunId as string
      try {
        const resolved = await this.sessions.resolveAgent(sessionId)
        signal.throwIfAborted()
        if ('error' in resolved) throw new PersonalTodoError(resolved.error.message)
        if (resolved.agent.status === 'running') continue
        resolved.agent.followup({
          id: randomUUID(),
          role: 'user',
          content: [{ type: 'text', text: recoveryPrompt(todo.id) }],
          source: { kind: 'user' },
        })
      } catch (error) {
        if (signal.aborted) return
        this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error))
      }
    }
  }

  /** Create or resume a root Session and dispatch one pending todo. */
  async start(id: string): Promise<Todo> {
    const before = this.store.get(id)
    const runId = randomUUID()
    const sessionId = before.primarySessionId ?? `personal-todo-${before.id}`
    this.store.beginRun(id, runId, sessionId)
    try {
      await this.sessions.create({
        sessionId,
        ...(this.config.agentPreset === undefined ? {} : { agentPreset: this.config.agentPreset }),
      })
      await this.deliver(sessionId, taskPrompt(before))
      return this.store.get(id)
    } catch (error) {
      this.store.failRun(id, runId, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /** Deliver a user's answer to the blocked root Session. */
  async reply(request: ReplyTodoRequest): Promise<Todo> {
    const todo = this.store.reply(request)
    const sessionId = todo.primarySessionId
    const runId = todo.activeRunId
    if (sessionId === null || runId === null) throw new PersonalTodoError(`todo ${JSON.stringify(todo.id)} has no active Session`)
    try {
      await this.deliver(sessionId, replyPrompt(todo.id, request.message.trim()))
      return this.store.get(todo.id)
    } catch (error) {
      this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /** Start a new run in the same root Session with the user's review feedback. */
  async requestChanges(request: RequestTodoChangesRequest): Promise<Todo> {
    const runId = randomUUID()
    const todo = this.store.requestChanges(request, runId)
    const sessionId = todo.primarySessionId
    if (sessionId === null) throw new PersonalTodoError(`todo ${JSON.stringify(todo.id)} has no primary Session`)
    try {
      await this.deliver(sessionId, changesPrompt(todo.id, request.feedback.trim()))
      return this.store.get(todo.id)
    } catch (error) {
      this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error))
      throw error
    }
  }
}
