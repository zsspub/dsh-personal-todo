/** Browser plugin adding a localized personal-todo manager to the sidebar footer. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import personalTodoRemote from 'dsh-personal-todo/remote'
import { PersonalTodoPanel, type PersonalTodoPanelInjected } from './PersonalTodoPanel.tsx'
import { en, NS, zh, type PersonalTodoKey } from './locales.ts'

export { PersonalTodoPanel } from './PersonalTodoPanel.tsx'
export type { PersonalTodoPanelInjected, PersonalTodoPanelProps } from './PersonalTodoPanel.tsx'
export type { PersonalTodoKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Personal todo panel controls and status copy. */
    personalTodo: PersonalTodoKey
  }
}

export const inject = ['slots', 'locale', 'remote']

function remoteFailure(result: { readonly error: { readonly message: string; readonly code: string } }): Error {
  return new Error(`${result.error.message} (${result.error.code})`)
}

/** Mount the generated Remote namespace and register one additive sidebar action. */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'personal-todo: dictionaries')
  const disposeRemote = await ctx.remote.$mount(personalTodoRemote)
  const uiFiber = ctx.inject(['remote.personalTodo'], (scope: ClientContext) => {
    scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
      name: 'sidebar.footer.action',
      id: 'personal-todo',
      order: 40,
      locale: NS,
      inject: (): PersonalTodoPanelInjected => ({
        list: async (request, signal) => {
          const result = await scope.remote.personalTodo.list(request, signal)
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
        delete: async (id, signal) => {
          const result = await scope.remote.personalTodo.delete({ id }, signal)
          if (!result.ok) throw remoteFailure(result)
          return result.value
        },
      }),
    }, PersonalTodoPanel))
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
