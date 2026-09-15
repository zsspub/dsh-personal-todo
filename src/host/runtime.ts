import type { TodoLiveStatus } from '../types.ts'
import type { TodoAgentRegistry } from './orchestrator.ts'

export interface RuntimeEvent {
  readonly type: string
  readonly data?: unknown
}

export interface TodoSessionQuery {
  readSession(id: string): Promise<{ readonly events: readonly RuntimeEvent[] }>
}

export class TodoRuntime {
  private readonly watched = new Set<string>()
  private readonly states = new Map<string, TodoLiveStatus>()
  private readonly reads = new Map<string, Promise<void>>()
  private readonly retryAfter = new Map<string, number>()
  private disposed = false

  constructor(
    private readonly agents: TodoAgentRegistry,
    private readonly query: TodoSessionQuery,
    private readonly warn: (message: string) => void,
  ) {}

  watch(id: string): void {
    this.watched.add(id)
  }

  notify(id: string, status: TodoLiveStatus): void {
    if (!this.disposed && this.watched.has(id)) {
      this.states.set(id, status)
      this.retryAfter.delete(id)
    }
  }

  agentStatus(id: string, status: 'running' | 'idle'): void {
    if (status === 'running' || !['failed', 'stopped'].includes(this.states.get(id) ?? '')) this.notify(id, status)
  }

  agentDisposed(id: string): void {
    if (this.states.get(id) === 'running') this.notify(id, 'stopped')
  }

  event(id: string, event: RuntimeEvent): void {
    if (event.type === 'turn/start') this.notify(id, 'running')
    if (event.type === 'turn/end') {
      const data = event.data as { reason?: { kind?: string } } | undefined
      const kind = data?.reason?.kind
      this.notify(id, kind === 'error' || kind === 'max-tokens' ? 'failed'
        : kind === 'aborted' || kind === 'interrupted' ? 'stopped' : 'idle')
    }
  }

  status(id: string): TodoLiveStatus {
    if (this.agents.get(id)?.status === 'running') return 'running'
    const state = this.states.get(id)
    return state === 'running'
      ? this.agents.get(id)?.status === 'idle' ? 'idle' : 'stopped'
      : state ?? 'unavailable'
  }

  async refresh(id: string): Promise<void> {
    this.watch(id)
    if (this.disposed || this.agents.get(id)?.status === 'running'
      || (this.states.has(id) && this.states.get(id) !== 'unavailable')
      || Date.now() < (this.retryAfter.get(id) ?? 0)) return
    const pending = this.reads.get(id)
    if (pending !== undefined) return pending
    const read = Promise.resolve().then(() => this.query.readSession(id)).then(snapshot => {
      if (this.disposed || (this.states.has(id) && this.states.get(id) !== 'unavailable')) return
      const last = snapshot.events.findLast(event => event.type === 'turn/start' || event.type === 'turn/end')
      if (last?.type === 'turn/end') this.event(id, last)
      else this.notify(id, last === undefined ? 'idle' : 'stopped')
    }).catch(() => {
      if (!this.disposed && (!this.states.has(id) || this.states.get(id) === 'unavailable')) {
        this.notify(id, 'unavailable')
        this.retryAfter.set(id, Date.now() + 30_000)
        this.warn('待办关联会话状态暂不可用，请在原对话中查看。')
      }
    }).finally(() => { this.reads.delete(id) })
    this.reads.set(id, read)
    return read
  }

  dispose(): void {
    this.disposed = true
    this.states.clear()
    this.watched.clear()
    this.reads.clear()
    this.retryAfter.clear()
  }
}
