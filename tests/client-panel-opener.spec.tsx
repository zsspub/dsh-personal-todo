import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { type ComponentProps } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot, WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { PersonalTodoPanelOpener, recentTodoWorkspace, type PanelOpenHost } from '../src/client/panel-opener.ts'
import { PersonalTodoTrigger } from '../src/client/PersonalTodoPanel.tsx'
import { PersonalTodoCanvasController } from '../src/client/canvas.ts'
import { zh } from '../src/client/locales.ts'

function source<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set(next: T) { value = next; for (const listener of [...listeners]) listener() },
    listeners,
  }
}
const sessionId = 'created-session' as SessionId
const previousId = 'previous-session' as SessionId
const workspaceId = 'workspace-one' as WorkspaceId
function workspace(id = workspaceId, sessionIds: SessionId[] = [], createdAt = '2026-10-18T00:00:00Z'): WorkspaceView {
  return { workspaceId: id, path: `/work/${id}`, title: id, sessionIds, createdAt, updatedAt: createdAt }
}
function summary(id: SessionId, updatedAt: number): SessionSummary {
  return { id, updatedAt, blank: false, displayTitle: id, running: false, retainedBy: {} }
}
function setup(selected?: SessionId) {
  const current = source(selected)
  const mounted = source(selected)
  const sessions = source<SessionListState>({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  const workspaces = source<WorkspaceSnapshot>({ items: [workspace()], archivedSessionIds: [], pinnedSessionIds: [], phase: 'ready', state: 'idle', error: null })
  let navigation = new AbortController()
  const host = {
    current, mounted,
    sessions: { list: sessions, create: vi.fn(async () => sessionId) },
    workspaces: { list: workspaces },
    beginNavigation: () => { navigation.abort(); navigation = new AbortController(); return navigation.signal },
    reveal: vi.fn((id: SessionId) => { navigation.abort(); current.set(id) }),
    openTab: vi.fn(),
    opened: vi.fn(),
    message: (reason: 'workspaceRequired' | 'timeout') => reason === 'workspaceRequired' ? '请先选择工作区' : '等待超时',
  } satisfies PanelOpenHost
  const opener = new PersonalTodoPanelOpener(host)
  return { host, opener, current, mounted, sessions, workspaces, navigate: () => { navigation.abort() } }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('待办面板打开流程', () => {
  it('无右侧 UI 时入口仍展示打开中及失败，重试按钮完成打开', async () => {
    const { host, opener, mounted } = setup()
    host.sessions.create.mockRejectedValueOnce(new Error('创建被拒绝'))
    const props = {
      wide: false,
      t: (key: keyof typeof zh, args?: { message?: string }) => zh[key].replace('{message}', args?.message ?? ''),
      canvas: new PersonalTodoCanvasController(),
      panelOpener: opener,
      openCanvas: () => { void opener.open() },
      list: async () => ({ todos: [], counts: { pending: 0, inProgress: 0 } }),
    } as ComponentProps<typeof PersonalTodoTrigger>
    render(<PersonalTodoTrigger {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '打开个人待办' }))
    const busy = screen.getByRole('button', { name: '正在打开待办…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    expect(busy.getAttribute('aria-busy')).toBe('true')
    await act(async () => { await opener.open() })
    expect(screen.getByRole('alert').textContent).toContain('创建被拒绝')
    fireEvent.click(screen.getByRole('button', { name: '重试打开' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(16) })
    mounted.set(sessionId)
    await act(async () => { await vi.advanceTimersByTimeAsync(16) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(host.openTab).toHaveBeenCalledOnce()
  })

  it('无会话时创建普通空会话，延迟到右侧区域挂载后打开，连续点击只创建一次', async () => {
    const { host, opener, mounted } = setup()
    const first = opener.open()
    expect(opener.open('todo-one')).toBe(first)
    await vi.advanceTimersByTimeAsync(16)
    expect(host.sessions.create).toHaveBeenCalledExactlyOnceWith({ workspaceId })
    expect(host.reveal).toHaveBeenCalledExactlyOnceWith(sessionId)
    expect(host.openTab).not.toHaveBeenCalled()
    mounted.set(sessionId)
    await vi.advanceTimersByTimeAsync(16)
    await first
    expect(host.openTab).toHaveBeenCalledOnce()
    expect(host.opened).toHaveBeenCalledExactlyOnceWith(sessionId, 'todo-one')
    expect(opener.getSnapshot()).toEqual({ opening: false, error: undefined })
    expect(mounted.listeners.size).toBe(0)
  })

  it('有当前会话时只显示当前会话并打开面板，不更改工作区或创建会话', async () => {
    const { host, opener } = setup(previousId)
    const pending = opener.open()
    expect(host.openTab).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(16)
    await pending
    expect(host.sessions.create).not.toHaveBeenCalled()
    expect(host.reveal).toHaveBeenCalledExactlyOnceWith(previousId)
    expect(host.opened).toHaveBeenCalledExactlyOnceWith(previousId, undefined)
  })

  it('右侧 mounted 提前发布时，仅重试已知挂载错误', async () => {
    const { host, opener } = setup(previousId)
    host.openTab.mockImplementationOnce(() => { throw new Error('sidebarRight: no session surface is mounted') })
    const pending = opener.open()
    await vi.advanceTimersByTimeAsync(32)
    await pending
    expect(host.openTab).toHaveBeenCalledTimes(2)
    expect(opener.getSnapshot().error).toBeUndefined()
  })

  it('未知打开错误显示给用户，不吞错或反复调用', async () => {
    const { host, opener } = setup(previousId)
    host.openTab.mockImplementation(() => { throw new Error('unknown tab kind') })
    const pending = opener.open()
    await vi.advanceTimersByTimeAsync(32)
    await pending
    expect(host.openTab).toHaveBeenCalledOnce()
    expect(host.opened).not.toHaveBeenCalled()
    expect(opener.getSnapshot().error).toBe('unknown tab kind')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('在创建请求发出前导航已取消，不再创建会话', async () => {
    const { host, opener, navigate } = setup()
    const pending = opener.open()
    navigate()
    await pending
    expect(host.sessions.create).not.toHaveBeenCalled()
    expect(host.reveal).not.toHaveBeenCalled()
    expect(host.openTab).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('工作区和会话快照都就绪后再选择最近工作区', async () => {
    const { host, opener, sessions, workspaces, mounted } = setup()
    sessions.set({ ...sessions.getSnapshot(), phase: 'pending' })
    workspaces.set({ ...workspaces.getSnapshot(), phase: 'pending' })
    const pending = opener.open()
    await vi.advanceTimersByTimeAsync(16)
    expect(host.sessions.create).not.toHaveBeenCalled()
    sessions.set({ ...sessions.getSnapshot(), phase: 'ready' })
    expect(host.sessions.create).not.toHaveBeenCalled()
    workspaces.set({ ...workspaces.getSnapshot(), phase: 'ready' })
    await vi.advanceTimersByTimeAsync(16)
    mounted.set(sessionId)
    await vi.advanceTimersByTimeAsync(16)
    await pending
    expect(host.sessions.create).toHaveBeenCalledExactlyOnceWith({ workspaceId })
    expect(sessions.listeners.size + workspaces.listeners.size).toBe(0)
  })

  it('没有可用工作区时提示选择工作区，不创建目录或会话', async () => {
    const { host, opener, workspaces } = setup()
    workspaces.set({ ...workspaces.getSnapshot(), items: [] })
    await opener.open()
    expect(opener.getSnapshot().error).toBe('请先选择工作区')
    expect(host.sessions.create).not.toHaveBeenCalled()
    expect(host.reveal).not.toHaveBeenCalled()
  })

  it('创建失败可重试，不产生未处理的 Promise 拒绝', async () => {
    const { host, opener, mounted } = setup()
    host.sessions.create.mockRejectedValueOnce(new Error('没有创建权限'))
    await opener.open('todo-one')
    expect(opener.getSnapshot().error).toBe('没有创建权限')
    expect(host.reveal).not.toHaveBeenCalled()
    const retry = opener.retry()
    await vi.advanceTimersByTimeAsync(16)
    mounted.set(sessionId)
    await vi.advanceTimersByTimeAsync(16)
    await retry
    expect(host.opened).toHaveBeenCalledExactlyOnceWith(sessionId, 'todo-one')
  })

  it('挂载超时保留已创建会话；重试复用当前选择，不再创建', async () => {
    const { host, opener, mounted } = setup()
    const pending = opener.open('todo-one')
    await vi.advanceTimersByTimeAsync(10_100)
    await pending
    expect(opener.getSnapshot().error).toBe('等待超时')
    expect(vi.getTimerCount()).toBe(0)
    mounted.set(sessionId)
    const retry = opener.retry()
    await vi.advanceTimersByTimeAsync(16)
    await retry
    expect(host.sessions.create).toHaveBeenCalledOnce()
    expect(host.opened).toHaveBeenCalledExactlyOnceWith(sessionId, 'todo-one')
  })

  it('初始数据等待超时后释放订阅并显示错误', async () => {
    const { host, opener, sessions, workspaces, current } = setup()
    sessions.set({ ...sessions.getSnapshot(), phase: 'pending' })
    const pending = opener.open()
    await vi.advanceTimersByTimeAsync(10_000)
    await pending
    expect(opener.getSnapshot().error).toBe('等待超时')
    expect(host.sessions.create).not.toHaveBeenCalled()
    expect(sessions.listeners.size + workspaces.listeners.size + current.listeners.size).toBe(0)
  })

  it.each(['切换会话', '切换主面板', '禁用插件'])('创建尚未返回时%s，不抢回导航或打开面板', async (action) => {
    const { host, opener, current, navigate } = setup()
    let created!: (id: SessionId) => void
    host.sessions.create.mockImplementation(() => new Promise(resolve => { created = resolve }))
    const pending = opener.open()
    await vi.advanceTimersByTimeAsync(0)
    if (action === '切换会话') current.set(previousId)
    else if (action === '切换主面板') navigate()
    else opener.dispose()
    created(sessionId)
    await pending
    expect(host.reveal).not.toHaveBeenCalled()
    expect(host.openTab).not.toHaveBeenCalled()
    expect(current.listeners.size).toBe(0)
    expect(opener.getSnapshot().error).toBeUndefined()
    if (action === '禁用插件') {
      await opener.open()
      expect(host.sessions.create).toHaveBeenCalledOnce()
    }
  })

  it.each(['切换会话', '切换主面板', '禁用插件'])('挂载等待期间%s，清理动画帧和订阅', async (action) => {
    const { host, opener, current, mounted, navigate } = setup()
    const pending = opener.open()
    await vi.advanceTimersByTimeAsync(16)
    if (action === '切换会话') current.set(previousId)
    else if (action === '切换主面板') navigate()
    else opener.dispose()
    mounted.set(sessionId)
    await vi.advanceTimersByTimeAsync(16)
    await pending
    expect(host.openTab).not.toHaveBeenCalled()
    expect(current.listeners.size + mounted.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('原生最近工作区规则', () => {
  it('按成员会话更新时间比较，空工作区使用创建时间，同值不改变宿主顺序', () => {
    const second = 'workspace-two' as WorkspaceId
    const a = workspace(workspaceId, [previousId], '2026-01-01T00:00:00Z')
    const b = workspace(second, [], '2026-02-01T00:00:00Z')
    expect(recentTodoWorkspace([a, b], { [previousId]: summary(previousId, Date.parse('2026-03-01T00:00:00Z')) })).toBe(workspaceId)
    expect(recentTodoWorkspace([a, b], {})).toBe(second)
    expect(recentTodoWorkspace([a, { ...b, createdAt: a.createdAt }], {})).toBe(workspaceId)
    expect(recentTodoWorkspace([], {})).toBeUndefined()
  })
})
