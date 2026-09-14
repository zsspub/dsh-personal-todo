import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { ListTodoInput, TodoDetail, TodoListResult } from '../types.ts'
import type { PersonalTodoKey } from './locales.ts'

export const TODO_SOURCE = 'personal-todo'
const categories = ['pending', 'in_progress'] as const
type Category = (typeof categories)[number]
const statusKeys = {
  pending: 'status.pending', in_progress: 'status.inProgress',
} as const
const countKeys = {
  pending: 'pending', in_progress: 'inProgress',
} as const

interface TodoInputApi {
  list(input: ListTodoInput, signal: AbortSignal): Promise<TodoListResult>
  get(id: string, signal: AbortSignal): Promise<TodoDetail>
}

function categoryPath(query: string): { category: Category; search: string } | undefined {
  const match = /^todo\/([^/]+)\/(.*)$/s.exec(query)
  if (!match || !categories.includes(match[1] as Category)) return undefined
  return { category: match[1] as Category, search: match[2]! }
}

/** 通过状态文件夹逐级浏览 Host 中的实时待办；发送引用时重新读取记录。 */
export function createTodoInputSource(api: TodoInputApi, t: (key: PersonalTodoKey) => string): InputTriggerSource {
  return {
    trigger: '@',
    name: TODO_SOURCE,
    showGroupTitle: false,
    async candidates(_session, { query, quoted, signal }) {
      if (quoted) return []
      signal.throwIfAborted()
      const path = categoryPath(query)
      if (!path) {
        if (query.includes('/')) return []
        const needle = query.trim().toLocaleLowerCase()
        const matches = categories.filter(category => `${t('panel.title')} todo ${category} ${t(statusKeys[category])}`.toLocaleLowerCase().includes(needle))
        if (!matches.length) return []
        const { counts } = await api.list({ limit: 1 }, signal)
        signal.throwIfAborted()
        return matches.map(category => ({
          name: t(statusKeys[category]),
          description: String(counts[countKeys[category]]),
          section: t('panel.title'),
          icon: 'folder' as const,
          value: `@todo/${category}/`,
          drill: true,
        }))
      }
      const search = path.search.trim()
      if (search.length > 500) return []
      const result = await api.list({
        statuses: [path.category],
        search, limit: 50,
      }, signal)
      signal.throwIfAborted()
      return result.todos.map(todo => ({
        name: todo.title,
        description: [todo.assignee, todo.notes, todo.id].filter(Boolean).join(' · '),
        section: `${t('panel.title')} · ${t(statusKeys[path.category])}${result.hasMore ? ` · ${t('input.refine')}` : ''}`,
        icon: 'file' as const,
        value: todo.id,
      }))
    },
    header(_session, { query }) {
      const path = categoryPath(query)
      if (!path) return undefined
      return [
        { label: t('panel.title'), value: '@' },
        { label: t(statusKeys[path.category]), value: `@todo/${path.category}/`, current: true },
      ]
    },
    onPick({ candidate, action }) {
      if (candidate.value === '@' || (candidate.value?.startsWith('@') && categoryPath(candidate.value.slice(1)))) {
        return { text: candidate.value, continue: true }
      }
      if (action === 'drill' || !candidate.value) return undefined
      return { insert: {
        source: TODO_SOURCE,
        ref: candidate.value,
        label: candidate.name,
        appearance: 'file',
        clipboardText: `personal-todo:${candidate.value}`,
      } }
    },
    codec: {
      clipboardText: ref => `personal-todo:${ref}`,
      async serialize(ref, signal) {
        signal.throwIfAborted()
        const { todo } = await api.get(ref, signal)
        signal.throwIfAborted()
        return `个人待办引用（personalTodo.get）：\n${JSON.stringify(todo, null, 2)}`
      },
    },
  }
}
