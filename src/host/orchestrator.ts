/** 基于 Host 普通会话服务编排待办的启动与恢复。 */

import { randomUUID } from 'node:crypto'
import { TODO_STATUSES } from '../types.ts'
import type {
  ReplyTodoRequest, RequestTodoChangesRequest, Todo, TodoStatus,
} from '../types.ts'
import { PersonalTodoError, TodoStore } from './store.ts'

export interface TodoAgent {
  readonly id: string
  readonly status: 'idle' | 'running'
  cancel(cause: { readonly kind: 'user' }): void
  whenIdle(): Promise<void>
  followup(message: {
    readonly id: string
    readonly role: 'user'
    readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
    readonly source: { readonly kind: 'user' }
  }): void
}

export interface TodoAgentRegistry {
  get(sessionId: string): TodoAgent | undefined
}

/** 独立插件所需的最小 Host 会话接口。 */
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
  const notes = todo.notes === null ? '无补充备注。' : todo.notes
  const assignee = todo.assignee === null ? '未分配。' : todo.assignee
  const priority = { none: '未设置', low: '低', medium: '中', high: '高' }[todo.priority]
  return [
    `执行个人待办 ${todo.id}。`,
    '执行前请加载并遵循 personal-todo-execution Skill。',
    '',
    `标题：${todo.title}`,
    `备注：${notes}`,
    `负责人：${assignee}`,
    `优先级：${priority}`,
    `截止时间：${todo.dueAt ?? '未设置'}`,
    `标签：${todo.tags.length === 0 ? '无' : JSON.stringify(todo.tags)}`,
  ].join('\n')
}

function replyPrompt(todoId: string, message: string): string {
  return `用户已回复阻塞中的个人待办 ${todoId}：\n\n${message}\n\n请继续执行任务，结果准备就绪后提交审核。`
}

function changesPrompt(todoId: string, feedback: string): string {
  return `用户要求修改个人待办 ${todoId}：\n\n${feedback}\n\n请根据反馈调整，汇报有意义的进展，并在结果准备就绪后重新提交审核。`
}

function recoveryPrompt(todoId: string): string {
  return `DSH 服务重启后，恢复执行个人待办 ${todoId}。执行前请查看已有对话，仅继续未完成的工作，结果准备就绪后提交审核。`
}

/** 启动和恢复每条待办所属的唯一普通根会话。 */
export class TodoOrchestrator {
  private readonly changing = new Set<string>()
  private readonly idleRuns = new Map<string, string>()
  private readonly observations = new Map<string, symbol>()
  private disposed = false

  constructor(
    private readonly store: TodoStore,
    private readonly sessions: TodoSessionController,
    private readonly config: TodoOrchestratorConfig,
    private readonly agents: TodoAgentRegistry,
  ) {}

  dispose(): void {
    this.disposed = true
    this.observations.clear()
    this.idleRuns.clear()
  }

  assertAvailable(id: string): void {
    if (this.changing.has(id)) throw new PersonalTodoError('任务正在切换执行状态，请稍后重试。')
  }

  private async exclusive(id: string, operation: () => Promise<Todo>): Promise<Todo> {
    this.assertAvailable(id)
    this.changing.add(id)
    let succeeded = false
    try {
      await operation()
      succeeded = true
    } finally {
      this.changing.delete(id)
      const runId = this.idleRuns.get(id)
      this.idleRuns.delete(id)
      if (succeeded && runId !== undefined) this.settleIdle(id, runId)
    }
    return this.store.get(id)
  }

  private settleIdle(id: string, runId: string): void {
    if (this.disposed) return
    const todo = this.store.get(id)
    if (todo.activeRunId === runId && todo.executionStatus === 'running') {
      this.store.stopExecution(id, 'Agent 已停止，尚未提交结果；可重试或由用户接手。')
    }
  }

  private observe(id: string, runId: string, agent: TodoAgent): void {
    const observation = Symbol()
    this.observations.set(id, observation)
    void agent.whenIdle().then(() => {
      if (this.disposed || this.observations.get(id) !== observation || agent.status !== 'idle') return
      this.observations.delete(id)
      if (this.changing.has(id)) this.idleRuns.set(id, runId)
      else this.settleIdle(id, runId)
    }).catch(() => undefined)
  }

  private async stopAgents(id: string): Promise<void> {
    this.observations.delete(id)
    this.idleRuns.delete(id)
    const deadline = Date.now() + 15_000
    const stopped = new Set<TodoAgent>()
    while (true) {
      const agents = this.store.detail(id).sessions
        .map(session => this.agents.get(session.sessionId))
        .filter((agent): agent is TodoAgent => agent !== undefined && (!stopped.has(agent) || agent.status !== 'idle'))
      if (agents.length === 0) return
      if (Date.now() >= deadline) throw new PersonalTodoError('未能确认 Agent 已停止，任务状态未变更，请稍后重试。')
      for (const agent of agents) agent.cancel({ kind: 'user' })
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all(agents.map(agent => agent.whenIdle())),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => { reject(new PersonalTodoError('未能确认 Agent 已停止，任务状态未变更，请稍后重试。')) }, Math.max(0, deadline - Date.now()))
          }),
        ])
        if (agents.some(agent => agent.status !== 'idle')) throw new PersonalTodoError('Agent 仍在执行，任务状态未变更。')
        for (const agent of agents) stopped.add(agent)
      } finally {
        if (timeout !== undefined) clearTimeout(timeout)
      }
    }
  }

  setStatus(id: string, status: TodoStatus): Promise<Todo> {
    return this.exclusive(id, async () => {
      if (!TODO_STATUSES.includes(status)) throw new PersonalTodoError('无效的任务状态。')
      const before = this.store.get(id)
      if (before.status === status) return before
      await this.stopAgents(id)
      if (this.store.get(id).executionStatus !== 'submitted') this.store.stopExecution(id)
      return this.store.setStatus(id, status)
    })
  }

  stop(id: string): Promise<Todo> {
    return this.exclusive(id, async () => {
      await this.stopAgents(id)
      return this.store.stopExecution(id)
    })
  }

  archive(id: string): Promise<Todo> {
    return this.exclusive(id, async () => {
      await this.stopAgents(id)
      this.store.stopExecution(id)
      return this.store.archive(id)
    })
  }

  private async deliver(sessionId: string, text: string): Promise<TodoAgent> {
    const resolved = await this.sessions.resolveAgent(sessionId)
    if ('error' in resolved) throw new PersonalTodoError(resolved.error.message)
    resolved.agent.followup({
      id: randomUUID(),
      role: 'user',
      content: [{ type: 'text', text }],
      source: { kind: 'user' },
    })
    return resolved.agent
  }

  /** 恢复已持久化且 Agent 尚未运行的执行中待办。 */
  async recover(signal: AbortSignal): Promise<void> {
    for (const todo of this.store.recoverableTodos()) {
      signal.throwIfAborted()
      if (this.changing.has(todo.id)) continue
      await this.exclusive(todo.id, async () => {
        const current = this.store.get(todo.id)
        if (current.activeRunId !== todo.activeRunId || current.executionStatus !== 'running') return current
        const sessionId = current.primarySessionId as string
        const runId = current.activeRunId as string
        try {
          const resolved = await this.sessions.resolveAgent(sessionId)
          signal.throwIfAborted()
          if ('error' in resolved) throw new PersonalTodoError(resolved.error.message)
          if (resolved.agent.status !== 'running') resolved.agent.followup({
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text: recoveryPrompt(todo.id) }],
            source: { kind: 'user' },
          })
          this.observe(todo.id, runId, resolved.agent)
        } catch (error) {
          if (signal.aborted) throw error
          this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error))
        }
        return this.store.get(todo.id)
      })
    }
  }

  /** 创建或复用根会话，并派发一条待处理待办。 */
  async start(id: string): Promise<Todo> {
    return this.exclusive(id, () => this.startRun(id))
  }

  private async startRun(id: string): Promise<Todo> {
    const before = this.store.get(id)
    const runId = randomUUID()
    const sessionId = before.primarySessionId ?? `personal-todo-${before.id}`
    this.store.beginRun(id, runId, sessionId)
    try {
      await this.sessions.create({
        sessionId,
        ...(this.config.agentPreset === undefined ? {} : { agentPreset: this.config.agentPreset }),
      })
      const agent = await this.deliver(sessionId, taskPrompt(before))
      this.observe(id, runId, agent)
      return this.store.get(id)
    } catch (error) {
      this.store.failRun(id, runId, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /** 将用户回复发送到被阻塞待办的根会话。 */
  async reply(request: ReplyTodoRequest): Promise<Todo> {
    return this.exclusive(request.id, () => this.replyRun(request))
  }

  private async replyRun(request: ReplyTodoRequest): Promise<Todo> {
    const todo = this.store.reply(request)
    const sessionId = todo.primarySessionId
    const runId = todo.activeRunId
    if (sessionId === null || runId === null) throw new PersonalTodoError(`todo ${JSON.stringify(todo.id)} has no active Session`)
    try {
      const agent = await this.deliver(sessionId, replyPrompt(todo.id, request.message.trim()))
      this.observe(todo.id, runId, agent)
      return this.store.get(todo.id)
    } catch (error) {
      this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  /** 携带用户审核意见，在同一根会话中开始新一轮执行。 */
  async requestChanges(request: RequestTodoChangesRequest): Promise<Todo> {
    return this.exclusive(request.id, () => this.changeRun(request))
  }

  private async changeRun(request: RequestTodoChangesRequest): Promise<Todo> {
    const runId = randomUUID()
    const todo = this.store.requestChanges(request, runId)
    const sessionId = todo.primarySessionId
    if (sessionId === null) throw new PersonalTodoError(`todo ${JSON.stringify(todo.id)} has no primary Session`)
    try {
      const agent = await this.deliver(sessionId, changesPrompt(todo.id, request.feedback.trim()))
      this.observe(todo.id, runId, agent)
      return this.store.get(todo.id)
    } catch (error) {
      this.store.failRun(todo.id, runId, error instanceof Error ? error.message : String(error))
      throw error
    }
  }
}
