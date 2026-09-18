/** 对话内待办卡片的持久化展示数据。 */

import type { ListTodoInput, Todo, TodoListResult } from './types.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

export const TODO_PRESENTATION_VERSION = 1
export const TODO_PRESENTATION_SNAPSHOT_LIMIT = 50

export interface PersonalTodoPresentationMeta {
  readonly kind: 'personal-todo-list'
  readonly version: typeof TODO_PRESENTATION_VERSION
  readonly query: ListTodoInput
  readonly snapshot: TodoListResult
  readonly snapshotTruncated: boolean
}

function unique<T extends string>(values: readonly T[] | undefined): T[] | undefined {
  if (values === undefined) return undefined
  return [...new Set(values)].sort()
}

/** 去掉分页游标，得到历史卡片后续刷新使用的稳定筛选条件。 */
export function normalizePresentationQuery(input: ListTodoInput): ListTodoInput {
  const statuses = unique(input.statuses)
  const priorities = unique(input.priorities)
  const tags = unique(input.tags?.map(tag => tag.trim().toLocaleLowerCase()).filter(Boolean))
  const search = input.search?.trim().toLocaleLowerCase()
  const dueBefore = input.dueBefore?.trim()
  return {
    ...(statuses === undefined ? {} : { statuses }),
    ...(priorities === undefined ? {} : { priorities }),
    ...(tags === undefined ? {} : { tags }),
    ...(dueBefore === undefined || dueBefore === '' ? {} : { dueBefore }),
    ...(search === undefined || search === '' ? {} : { search }),
    ...(input.archived === undefined ? {} : { archived: input.archived }),
  }
}

function boundedTodo(todo: Todo): Todo {
  return {
    ...todo,
    notes: todo.notes === null ? null : todo.notes.slice(0, 2_000),
    latestSummary: todo.latestSummary === null ? null : todo.latestSummary.slice(0, 2_000),
    blockedReason: todo.blockedReason === null ? null : todo.blockedReason.slice(0, 1_000),
  }
}

/** 创建可随 Session 日志持久化的有界卡片快照。 */
export function personalTodoPresentationMeta(
  input: ListTodoInput,
  result: TodoListResult,
): PersonalTodoPresentationMeta & JsonValue {
  const todos = result.todos.slice(0, TODO_PRESENTATION_SNAPSHOT_LIMIT).map(boundedTodo)
  return {
    kind: 'personal-todo-list',
    version: TODO_PRESENTATION_VERSION,
    query: normalizePresentationQuery(input),
    snapshot: {
      todos,
      total: result.total,
      counts: result.counts,
      hasMore: result.hasMore || result.todos.length > todos.length,
    },
    snapshotTruncated: result.hasMore || result.todos.length > todos.length,
  } as PersonalTodoPresentationMeta & JsonValue
}

export function isPersonalTodoPresentationMeta(value: unknown): value is PersonalTodoPresentationMeta {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Partial<PersonalTodoPresentationMeta>
  return candidate.kind === 'personal-todo-list'
    && candidate.version === TODO_PRESENTATION_VERSION
    && candidate.query !== null
    && typeof candidate.query === 'object'
    && candidate.snapshot !== null
    && typeof candidate.snapshot === 'object'
    && Array.isArray(candidate.snapshot.todos)
    && typeof candidate.snapshot.total === 'number'
}
