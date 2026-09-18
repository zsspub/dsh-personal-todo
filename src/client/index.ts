/** 在侧栏底部添加支持多语言的个人待办管理入口。 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ISessions, SessionId, SubagentAddress } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import personalTodoRemote from 'dsh-personal-todo/remote'
import {
  PersonalTodoCanvas, PersonalTodoTrigger, type PersonalTodoPanelInjected,
} from './PersonalTodoPanel.tsx'
import { TodoToolCard, type TodoToolCardProps } from './TodoToolCard.tsx'
import { TodoTurnTail, type TodoTurnTailInjected } from './TodoTurnTail.tsx'
import { PersonalTodoDataCenter, type PersonalTodoRemoteApi } from './data-center.ts'
import { createTodoInputSource } from './input-source.ts'
import { installTodoInputIcon } from './input-source-icon.ts'
import { en, NS, zh, type PersonalTodoKey } from './locales.ts'
import { personalTodoTurnDefinition, selectPersonalTodoTail } from './turn-todos.ts'

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
  'slots', 'locale', 'remote', 'sessions', 'sidebarRight', 'sidebarRightTabs', 'uiConversation',
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
    const openSession = async (id: string, parentId: string | null): Promise<boolean> => {
      const sessionId = id as SessionId
      if (parentId === null) {
        sessions.open(sessionId)
        return true
      }
      const retained = sessions.subagentAddress(sessionId)
      if (retained !== undefined) {
        sessions.openSubagent(retained)
        return true
      }
      const parentSessionId = parentId as SessionId
      sessions.open(parentSessionId)
      await sessions.refreshSubagents(parentSessionId)
      const child = sessions.list.getSnapshot().subagentsByParent[parentSessionId]?.entries
        .find(entry => entry.kind === 'child' && entry.id === sessionId)
      if (child?.kind !== 'child') return false
      sessions.openSubagent({ parentSessionId, childSessionId: sessionId, mode: child.mode } satisfies SubagentAddress)
      return true
    }
    const panel = (): PersonalTodoPanelInjected => ({
      dataCenter,
      canvas: dataCenter.canvas,
      openCanvas: () => {
        dataCenter.canvas.open()
        try {
          scope.sidebarRight.openTab(PERSONAL_TODO_TAB_KIND)
        } catch (error) {
          if (error instanceof Error && error.message === 'sidebarRight: no session surface is mounted') return
          throw error
        }
      },
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
    const openPanel = (): void => {
      try {
        scope.sidebarRight.openTab(PERSONAL_TODO_TAB_KIND)
      } catch (error) {
        if (error instanceof Error && error.message === 'sidebarRight: no session surface is mounted') return
        throw error
      }
    }
    dataCenter.setOpenPanel(openPanel)
    scope.uiConversation.events.register(personalTodoTurnDefinition)
    scope.inject(['inputTriggers'], inputScope => {
      const t = inputScope.locale.bind(NS)
      inputScope.effect(installTodoInputIcon, 'personal-todo: reference icons')
      inputScope.effect(() => inputScope.inputTriggers.registerSource(createTodoInputSource({
        list: dataCenter.list.bind(dataCenter),
        get: dataCenter.get.bind(dataCenter),
      }, t)), 'personal-todo: input references')
    })
    const t = scope.locale.bind(NS)
    scope.effect(() => scope.sidebarRightTabs.register({
      id: PERSONAL_TODO_TAB_ID,
      kind: PERSONAL_TODO_TAB_KIND,
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
      priority: -20,
      select: selectPersonalTodoTail,
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
