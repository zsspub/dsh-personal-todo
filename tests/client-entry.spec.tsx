/** 使用真实 Cordis 生命周期验证客户端注册、共享打开流程和卸载。 */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import type { PersonalTodoPanelInjected } from '../src/client/PersonalTodoPanel.tsx'
import { PersonalTodoTrigger, PersonalTodoCanvas } from '../src/client/PersonalTodoPanel.tsx'

interface Registration {
  readonly name: string
  readonly key?: string
  readonly inject?: () => PersonalTodoPanelInjected
  readonly component: unknown
}

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function boot() {
  const ctx = new Context()
  contexts.push(ctx)
  const registrations: Registration[] = []
  const definitions: { id: string; kind: string; keepMounted?: boolean }[] = []
  const released = vi.fn()
  const closeIn = vi.fn()
  const disposeRemote = vi.fn(async () => {})
  const current = { getSnapshot: () => ({ key: undefined }), subscribe: () => () => {} }
  ctx.provide('slots', {
    inject: (_name: string, register: () => () => void) => ctx.effect(register),
    register: (options: Omit<Registration, 'component'>, component: unknown) => {
      const entry = { ...options, component }
      registrations.push(entry)
      return () => { registrations.splice(registrations.indexOf(entry), 1) }
    },
  } as never)
  ctx.provide('locale', { register: () => released, bind: () => (key: string) => key } as never)
  ctx.provide('remote', { personalTodo: {}, $mount: async () => disposeRemote } as never)
  ctx.provide('remote.personalTodo', {} as never)
  ctx.provide('sessions', {} as never)
  ctx.provide('workspaces', {} as never)
  ctx.provide('uiWorkspace', {} as never)
  ctx.provide('uiSession', { adapter: { current } } as never)
  ctx.provide('layout', {} as never)
  ctx.provide('uiConversation', { events: { register: vi.fn() } } as never)
  ctx.provide('sidebarRight', {
    mounted: current,
    openTabs: { getSnapshot: () => [
      { kind: 'personal-todo', sessionId: 'one', tabId: 'todo-one' },
      { kind: 'file', sessionId: 'one', tabId: 'file-one' },
      { kind: 'personal-todo', sessionId: 'two', tabId: 'todo-two' },
    ] },
    closeIn,
  } as never)
  ctx.provide('sidebarRightTabs', {
    register: (definition: typeof definitions[number]) => {
      definitions.push(definition)
      return () => { definitions.splice(definitions.indexOf(definition), 1) }
    },
  } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, registrations, definitions, closeIn, released, disposeRemote }
}

describe('待办客户端生命周期', () => {
  it('注册保留挂载的原生 tab，侧栏和对话卡片共用打开控制器，卸载只关闭待办', async () => {
    const h = await boot()
    expect(h.definitions).toEqual([expect.objectContaining({ id: 'dsh-personal-todo', kind: 'personal-todo', keepMounted: true })])
    expect(h.registrations.find(entry => entry.name === 'sidebar.footer.action')?.component).toBe(PersonalTodoTrigger)
    expect(h.registrations.find(entry => entry.name === 'sidebar.right.pane.tab')?.component).toBe(PersonalTodoCanvas)
    const panel = h.registrations.find(entry => entry.name === 'sidebar.footer.action')?.inject?.()
    if (panel?.panelOpener === undefined || panel.dataCenter === undefined) throw new Error('待办入口缺少共享打开控制器')
    const open = vi.spyOn(panel.panelOpener, 'open').mockResolvedValue()
    panel.openCanvas()
    panel.dataCenter.openTodo('todo-from-chat')
    expect(open.mock.calls).toEqual([[], ['todo-from-chat']])
    await h.ctx.fiber.dispose()
    expect(h.registrations).toEqual([])
    expect(h.definitions).toEqual([])
    expect(h.closeIn.mock.calls).toEqual([['one', 'todo-one'], ['two', 'todo-two']])
    expect(h.disposeRemote).toHaveBeenCalledOnce()
    expect(h.released).toHaveBeenCalledOnce()
    panel.dataCenter.openTodo('after-disposal')
    expect(open).toHaveBeenCalledTimes(2)
  })
})
