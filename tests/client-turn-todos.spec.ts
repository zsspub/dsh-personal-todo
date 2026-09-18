import { describe, expect, it } from 'vitest'
import { personalTodoPresentationMeta } from '../src/presentation.ts'
import {
  personalTodoTurnDefinition, selectPersonalTodoTail,
} from '../src/client/turn-todos.ts'
import type { Todo, TodoListResult } from '../src/types.ts'

function todo(id: string): Todo {
  return {
    id,
    title: `待办 ${id}`,
    notes: null,
    assignee: null,
    status: 'pending',
    executionStatus: null,
    priority: 'medium',
    dueAt: null,
    tags: [],
    primarySessionId: null,
    activeRunId: null,
    latestSummary: null,
    blockedReason: null,
    reviewRound: 0,
    revision: 0,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    completedAt: null,
    archivedAt: null,
  }
}

function meta(id: string) {
  const result: TodoListResult = {
    todos: [todo(id)],
    total: 1,
    counts: { pending: 1, inProgress: 0, completed: 0, cancelled: 0, archived: 0 },
    hasMore: false,
  }
  return personalTodoPresentationMeta({ statuses: ['pending'] }, result)
}

function startState() {
  return personalTodoTurnDefinition.start({} as never, {
    event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 3 } },
  } as never, {} as never)
}

function update(state: ReturnType<typeof startState>, event: unknown) {
  return personalTodoTurnDefinition.update({ state } as never, { event } as never)
}

describe('个人待办回合投影', () => {
  it('只发布成功的 personal_todo_show 结果，并保留最后一次展示', () => {
    let state = startState()
    state = update(state, {
      type: 'tool/call',
      seq: 2,
      time: 2,
      data: { turn: 3, step: 1, callId: 'list', name: 'personal_todo_list', arguments: '{}' },
    })
    state = update(state, {
      type: 'tool/call',
      seq: 3,
      time: 3,
      data: { turn: 3, step: 1, callId: 'show-1', name: 'personal_todo_show', arguments: '{}' },
    })
    state = update(state, {
      type: 'tool/result',
      seq: 4,
      time: 4,
      data: {
        turn: 3,
        step: 1,
        message: { source: { callId: 'list' }, content: [{ isError: false }] },
        meta: meta('ignored'),
      },
    })
    state = update(state, {
      type: 'tool/result',
      seq: 5,
      time: 5,
      data: {
        turn: 3,
        step: 1,
        message: { source: { callId: 'show-1' }, content: [{ isError: false }] },
        meta: meta('first'),
      },
    })
    state = update(state, {
      type: 'tool/call',
      seq: 6,
      time: 6,
      data: { turn: 3, step: 2, callId: 'show-2', name: 'personal_todo_show', arguments: '{}' },
    })
    state = update(state, {
      type: 'tool/result',
      seq: 7,
      time: 7,
      data: {
        turn: 3,
        step: 2,
        message: { source: { callId: 'show-2' }, content: [{ isError: false }] },
        meta: meta('second'),
      },
    })

    const published = personalTodoTurnDefinition.buildLocationData?.(
      { state } as never,
      'turn',
      null,
    )
    expect(published).toMatchObject({
      kind: 'turn',
      turn: 3,
      key: 'personal-todo',
      value: {
        results: [
          { callId: 'show-1', seq: 5, meta: { snapshot: { todos: [{ id: 'first' }] } } },
          { callId: 'show-2', seq: 7, meta: { snapshot: { todos: [{ id: 'second' }] } } },
        ],
      },
    })
    const owner = {
      seq: 7,
      turn: {
        status: 'closed',
        data: { get: () => published?.value },
      },
    } as never
    expect(selectPersonalTodoTail(owner)).toMatchObject({ callId: 'show-2' })
  })

  it('忽略失败、缺失 metadata 和尚未结束的回合', () => {
    let state = startState()
    state = update(state, {
      type: 'tool/call',
      seq: 2,
      time: 2,
      data: { turn: 3, step: 1, callId: 'show', name: 'personal_todo_show', arguments: '{}' },
    })
    for (const result of [
      {
        type: 'tool/result',
        seq: 3,
        time: 3,
        data: {
          turn: 3,
          step: 1,
          message: { source: { callId: 'show' }, content: [{ isError: true }] },
          meta: meta('failed'),
        },
      },
      {
        type: 'tool/result',
        seq: 4,
        time: 4,
        data: {
          turn: 3,
          step: 1,
          message: { source: { callId: 'show' }, content: [{ isError: false }] },
        },
      },
    ]) state = update(state, result)

    const published = personalTodoTurnDefinition.buildLocationData?.(
      { state } as never,
      'turn',
      null,
    )
    expect(published).toMatchObject({ key: 'personal-todo', value: { results: [] } })
    expect(selectPersonalTodoTail({
      seq: 5,
      turn: { status: 'open', data: { get: () => ({ results: [{ callId: 'show', seq: 3, meta: meta('hidden') }] }) } },
    } as never)).toBeNull()
  })
})
