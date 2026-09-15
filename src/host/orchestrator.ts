/** 仅在用户明确操作时启动或停止待办关联会话。 */

import { randomUUID } from 'node:crypto'
import { TODO_STATUSES } from '../types.ts'
import type { Todo, TodoStatus } from '../types.ts'
import { PersonalTodoError, TodoStore } from './store.ts'
import type { TodoRuntime } from './runtime.ts'

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

/** 显式操作与被动运行状态观察分离。 */
export class TodoOrchestrator {
  private readonly changing = new Set<string>()

  constructor(
    private readonly store: TodoStore,
    private readonly sessions: TodoSessionController,
    private readonly config: TodoOrchestratorConfig,
    private readonly agents: TodoAgentRegistry,
    private readonly runtime: TodoRuntime,
  ) {}

  assertAvailable(id: string): void {
    if (this.changing.has(id)) throw new PersonalTodoError('任务正在切换执行状态，请稍后重试。')
  }

  private async exclusive(id: string, operation: () => Promise<Todo>): Promise<Todo> {
    this.assertAvailable(id)
    this.changing.add(id)
    try {
      await operation()
    } finally {
      this.changing.delete(id)
    }
    return this.store.get(id)
  }

  private async stopAgents(id: string): Promise<void> {
    const deadline = Date.now() + 15_000
    const stopped = new Set<TodoAgent>()
    while (true) {
      const agents = this.store.detail(id).sessions
        .map(session => this.agents.get(session.sessionId))
        .filter((agent): agent is TodoAgent => agent !== undefined && (!stopped.has(agent) || agent.status !== 'idle'))
      if (agents.length === 0) return
      if (Date.now() >= deadline) throw new PersonalTodoError('未能确认 Agent 已停止，任务状态未变更，请稍后重试。')
      for (const agent of agents) {
        const running = agent.status === 'running'
        agent.cancel({ kind: 'user' })
        if (running) this.runtime.notify(agent.id, 'stopped')
      }
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
      const sessionId = this.store.get(id).primarySessionId
      if (sessionId !== null) this.runtime.notify(sessionId, 'stopped')
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

  /** 创建或复用根会话，并派发一条待处理待办。 */
  async start(id: string): Promise<Todo> {
    return this.exclusive(id, () => this.startRun(id))
  }

  private async startRun(id: string): Promise<Todo> {
    const before = this.store.get(id)
    const sessionId = before.primarySessionId ?? `personal-todo-${before.id}`
    if (this.agents.get(sessionId)?.status === 'running') throw new PersonalTodoError('Agent 正在执行，请到原对话继续。')
    if (before.archivedAt !== null || (before.status !== 'pending' && before.status !== 'in_progress')) {
      throw new PersonalTodoError('只有未归档的未完成任务可以交给 Agent。')
    }
    try {
      await this.sessions.create({
        sessionId,
        ...(this.config.agentPreset === undefined ? {} : { agentPreset: this.config.agentPreset }),
      })
      const resolved = await this.sessions.resolveAgent(sessionId)
      if ('error' in resolved) throw new PersonalTodoError(resolved.error.message)
      this.store.attachSession(id, sessionId)
      this.runtime.watch(sessionId)
      this.runtime.notify(sessionId, 'idle')
      resolved.agent.followup({
        id: randomUUID(), role: 'user', content: [{ type: 'text', text: taskPrompt(before) }],
        source: { kind: 'user' },
      })
      return this.store.get(id)
    } catch (error) {
      this.runtime.notify(sessionId, 'failed')
      throw error
    }
  }
}
