import { afterEach, describe, expect, it, vi } from 'vitest'
import { TodoRuntime, type RuntimeEvent } from '../src/host/runtime.ts'
import type { TodoAgent } from '../src/host/orchestrator.ts'

function setup() {
  const agents = new Map<string, TodoAgent>()
  const readSession = vi.fn<(id: string) => Promise<{ events: RuntimeEvent[] }>>()
    .mockResolvedValue({ events: [] })
  const warn = vi.fn()
  const runtime = new TodoRuntime(agents, { readSession }, warn)
  runtime.watch('root')
  return { agents, readSession, warn, runtime }
}

afterEach(() => { vi.useRealTimers() })

describe('会话运行状态的只读投影', () => {
  it.each([
    ['completed', 'idle'], ['blocked', 'idle'], ['error', 'failed'],
    ['max-tokens', 'failed'], ['aborted', 'stopped'], ['interrupted', 'stopped'],
  ] as const)('turn/end %s 只投影为 %s', (kind, status) => {
    const { runtime, readSession } = setup()
    runtime.event('root', { type: 'turn/end', data: { reason: { kind } } })
    runtime.agentStatus('root', 'idle')
    expect(runtime.status('root')).toBe(status)
    expect(readSession).not.toHaveBeenCalled()
  })

  it('忽略无关会话、子会话结束和正文事件，实时 Agent 优先于历史', () => {
    const { agents, runtime, readSession } = setup()
    agents.set('root', { status: 'running' } as TodoAgent)
    runtime.event('child', { type: 'turn/end', data: { reason: { kind: 'error' } } })
    runtime.event('root', { type: 'message', data: { content: '不复制正文' } })
    runtime.notify('root', 'failed')
    expect(runtime.status('root')).toBe('running')
    expect(runtime.status('child')).toBe('unavailable')
    expect(readSession).not.toHaveBeenCalled()
  })

  it('冷读缓存并去重，未结束的历史轮次显示已停止', async () => {
    const { runtime, readSession } = setup()
    readSession.mockResolvedValue({ events: [{ type: 'turn/start' }] })
    await Promise.all([runtime.refresh('root'), runtime.refresh('root')])
    await runtime.refresh('root')
    expect(readSession).toHaveBeenCalledExactlyOnceWith('root')
    expect(runtime.status('root')).toBe('stopped')
  })

  it('迟到的冷读不能覆盖新事件', async () => {
    const { runtime, readSession } = setup()
    let finish!: (value: { events: RuntimeEvent[] }) => void
    readSession.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const refreshing = runtime.refresh('root')
    await Promise.resolve()
    runtime.notify('root', 'failed')
    finish({ events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] })
    await refreshing
    expect(runtime.status('root')).toBe('failed')
  })

  it('读失败或同步抛错不传播，30 秒后允许重试', async () => {
    vi.useFakeTimers()
    const { runtime, readSession, warn } = setup()
    readSession.mockImplementationOnce(() => { throw new Error('无法读取') })
    await runtime.refresh('root')
    expect(runtime.status('root')).toBe('unavailable')
    await runtime.refresh('root')
    expect(readSession).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    await runtime.refresh('root')
    expect(runtime.status('root')).toBe('idle')
    expect(readSession).toHaveBeenCalledTimes(2)
  })

  it('运行中的 Agent 销毁后不再显示运行，卸载后不处理事件和冷读', async () => {
    const { runtime, readSession } = setup()
    runtime.agentStatus('root', 'running')
    runtime.agentDisposed('root')
    expect(runtime.status('root')).toBe('stopped')
    runtime.dispose()
    runtime.event('root', { type: 'turn/start' })
    await runtime.refresh('root')
    expect(readSession).not.toHaveBeenCalled()
    expect(runtime.status('root')).toBe('unavailable')
  })

  it('冷读读取最后一个轮次结束原因', async () => {
    const { runtime, readSession } = setup()
    readSession.mockResolvedValue({ events: [
      { type: 'turn/end', data: { reason: { kind: 'error' } } },
      { type: 'turn/start' },
      { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    ] })
    await runtime.refresh('root')
    expect(runtime.status('root')).toBe('idle')
  })
})
