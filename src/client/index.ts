/** 在侧栏底部添加支持多语言的个人待办管理入口。 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import personalTodoRemote from 'dsh-personal-todo/remote'
import {
  PersonalTodoCanvas, PersonalTodoTrigger, type PersonalTodoPanelInjected,
} from './PersonalTodoPanel.tsx'
import { TodoToolCard, type TodoToolCardProps } from './TodoToolCard.tsx'
import { TodoTurnTail, type TodoTurnTailInjected } from './TodoTurnTail.tsx'
import { PersonalTodoDataCenter, type PersonalTodoRemoteApi } from './data-center.ts'
import { PersonalTodoPanelOpener } from './panel-opener.ts'
import { createTodoInputSource } from './input-source.ts'
import { installTodoInputIcon } from './input-source-icon.ts'
import { en, NS, zh, type PersonalTodoKey } from './locales.ts'
import { personalTodoTurnDefinition } from './turn-todos.ts'

export { PersonalTodoCanvas, PersonalTodoTrigger } from './PersonalTodoPanel.tsx'
export type {
  PersonalTodoCanvasProps, PersonalTodoPanelInjected, PersonalTodoTriggerProps,
} from './PersonalTodoPanel.tsx'
export type { PersonalTodoKey } from './locales.ts'

const PERSONAL_TODO_TAB_ID = 'dsh-personal-todo'
const PERSONAL_TODO_TAB_KIND = 'personal-todo'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 个人待办面板的控件和状态文案。 */
    personalTodo: PersonalTodoKey
  }
}

export const inject = [
  'slots', 'locale', 'remote', 'sessions', 'workspaces', 'uiWorkspace', 'uiSession', 'layout',
  'sidebarRight', 'sidebarRightTabs', 'uiConversation',
]

function remoteFailure(result: { readonly error: { readonly message: string; readonly code: string } }): Error {
  return new Error(`${result.error.message} (${result.error.code})`)
}

/** 挂载生成的 Remote 命名空间，并注册侧栏入口和待办面板。 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'personal-todo: dictionaries')
  const disposeRemote = await ctx.remote.$mount(personalTodoRemote)
  const uiFiber = ctx.inject(['remote.personalTodo'], (scope: ClientContext) => {
    const sessions = (scope as unknown as { readonly sessions: ISessions }).sessions
    const remote: PersonalTodoRemoteApi = {
      list: async (request, signal) => {
        const result = await scope.remote.personalTodo.list(request, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      exportData: async (signal) => {
        const result = await scope.remote.personalTodo.exportData({}, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      importData: async (request, signal) => {
        const result = await scope.remote.personalTodo.importData(request, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      get: async (id, signal) => {
        const result = await scope.remote.personalTodo.get({ id }, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      create: async (request, signal) => {
        const result = await scope.remote.personalTodo.create(request, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      update: async (request, signal) => {
        const result = await scope.remote.personalTodo.update(request, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      start: async (id, signal) => {
        const result = await scope.remote.personalTodo.start({ id }, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      setStatus: async (request, signal) => {
        const result = await scope.remote.personalTodo.setStatus(request, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      stop: async (id, signal) => {
        const result = await scope.remote.personalTodo.stop({ id }, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      approve: async (id, signal) => {
        const result = await scope.remote.personalTodo.approve({ id }, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      archive: async (id, signal) => {
        const result = await scope.remote.personalTodo.archive({ id }, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      restore: async (id, signal) => {
        const result = await scope.remote.personalTodo.restore({ id }, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
      delete: async (id, signal) => {
        const result = await scope.remote.personalTodo.delete({ id }, signal)
        if (!result.ok) throw remoteFailure(result)
        return result.value
      },
    }
    const dataCenter = new PersonalTodoDataCenter(remote)
    scope.effect(() => () => { dataCenter.dispose() }, 'personal-todo: data center')
    const t = scope.locale.bind(NS)
    const current = scope.uiSession.adapter.current
    const panelOpener = new PersonalTodoPanelOpener({
      sessions,
      workspaces: scope.workspaces,
      current: {
        getSnapshot: () => current.getSnapshot().key as SessionId | undefined,
        subscribe: listener => current.subscribe(listener),
      },
      mounted: scope.sidebarRight.mounted,
      beginNavigation: () => scope.layout.beginNavigation(),
      reveal: id => { scope.uiWorkspace.openSession(id) },
      openTab: () => { scope.sidebarRight.openTab(PERSONAL_TODO_TAB_KIND) },
      opened: (sessionId, todoId) => {
        if (todoId === undefined) dataCenter.canvas.open()
        else dataCenter.canvas.focusTodo(todoId, sessionId, scope.sidebarRight.active()?.id)
      },
      message: reason => t(reason === 'workspaceRequired' ? 'trigger.workspaceRequired' : 'trigger.openTimeout'),
    })
    const openSession = async (id: string, parentId: string | null): Promise<boolean> => {
      const sessionId = id as SessionId
      if (parentId === null) {
        scope.uiWorkspace.openSession(sessionId)
        return true
      }
      const retained = sessions.subagentAddress(sessionId)
      if (retained !== undefined) {
        scope.uiWorkspace.openSession(retained)
        return true
      }
      const parentSessionId = parentId as SessionId
      await sessions.refreshProjections(parentSessionId)
      const child = sessions.subagentAddress(sessionId)
      if (child === undefined) return false
      scope.uiWorkspace.openSession(child)
      return true
    }
    const panel = (): PersonalTodoPanelInjected => ({
      dataCenter,
      canvas: dataCenter.canvas,
      panelOpener,
      openCanvas: () => { void panelOpener.open() },
      list: dataCenter.list.bind(dataCenter),
      exportData: dataCenter.exportData.bind(dataCenter),
      importData: dataCenter.importData.bind(dataCenter),
      get: dataCenter.get.bind(dataCenter),
      create: dataCenter.create.bind(dataCenter),
      update: dataCenter.update.bind(dataCenter),
      start: dataCenter.start.bind(dataCenter),
      setStatus: dataCenter.setStatus.bind(dataCenter),
      stop: dataCenter.stop.bind(dataCenter),
      approve: dataCenter.approve.bind(dataCenter),
      archive: dataCenter.archive.bind(dataCenter),
      restore: dataCenter.restore.bind(dataCenter),
      delete: dataCenter.delete.bind(dataCenter),
      openSession,
    })
    dataCenter.setOpenPanel(id => { void panelOpener.open(id) })
    scope.uiConversation.events.register(personalTodoTurnDefinition)
    scope.inject(['inputTriggers'], inputScope => {
      const t = inputScope.locale.bind(NS)
      inputScope.effect(installTodoInputIcon, 'personal-todo: reference icons')
      inputScope.effect(() => inputScope.inputTriggers.registerSource(createTodoInputSource({
        list: dataCenter.list.bind(dataCenter),
        get: dataCenter.get.bind(dataCenter),
      }, t)), 'personal-todo: input references')
    })
    scope.effect(() => scope.sidebarRightTabs.register({
      id: PERSONAL_TODO_TAB_ID,
      kind: PERSONAL_TODO_TAB_KIND,
      keepMounted: true,
      title: () => t('panel.title'),
    }), 'personal-todo: right sidebar tab type')
    scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
      name: 'sidebar.footer.action',
      id: 'personal-todo',
      order: 40,
      locale: NS,
      inject: panel,
    }, PersonalTodoTrigger))
    scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({
      name: 'sidebar.right.pane.tab',
      key: PERSONAL_TODO_TAB_ID,
      locale: NS,
      inject: panel,
    }, PersonalTodoCanvas))
    scope.slots.inject('conversation.chat.turnTail', () => scope.slots.register({
      name: 'conversation.chat.turnTail',
      id: 'personal-todo-turn-tail',
      order: -20,
      locale: NS,
      inject: (): TodoTurnTailInjected => ({
        dataCenter,
        openSession,
      }),
    }, TodoTurnTail))
    scope.slots.inject('tool.call.toolview', () => {
      const inject = (): Pick<TodoToolCardProps, 'dataCenter' | 'openSession'> => ({
        dataCenter,
        openSession,
      })
      return scope.slots.register({
        name: 'tool.call.toolview',
        key: 'personal_todo_list',
        locale: NS,
        inject,
      }, TodoToolCard)
    })
    // 最后登记，确保标签类型和插槽撤销前先关闭已挂载的待办实例。
    scope.effect(() => () => {
      panelOpener.dispose()
      for (const tab of scope.sidebarRight.openTabs.getSnapshot()) {
        if (tab.kind === PERSONAL_TODO_TAB_KIND) scope.sidebarRight.closeIn(tab.sessionId, tab.tabId)
      }
    }, 'personal-todo: panel opening and tabs')
  })
  try {
    await uiFiber
  } catch (error) {
    await disposeRemote()
    throw error
  }
  return async () => {
    await uiFiber.dispose()
    await disposeRemote()
  }
}
