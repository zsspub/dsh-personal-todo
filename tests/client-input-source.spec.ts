import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CandidateRequest, ClientSessionContext, InputTriggerCandidate, InputTriggerPick } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { TodoStore } from '../src/host/store.ts'
import { createTodoInputSource, TODO_SOURCE } from '../src/client/input-source.ts'
import { zh } from '../src/client/locales.ts'
import type { ListTodoInput } from '../src/types.ts'

const stores: TodoStore[] = []
const session = { sessionId: 'session-one' } as ClientSessionContext
const request = (query = '', signal = new AbortController().signal): CandidateRequest => ({ query, signal, position: 'inline', drilled: false })
const pick = (candidate: InputTriggerCandidate): InputTriggerPick => ({ candidate, session, position: 'inline', via: 'menu', action: 'pick', span: { start: 0, end: 1, draftRev: 1 } })
function setup() {
  const store = new TodoStore({ databasePath: ':memory:', journalMode: 'wal', busyTimeoutMs: 1000, defaultListLimit: 50, maxListLimit: 200 })
  stores.push(store)
  const list = vi.fn(async (input: ListTodoInput, signal: AbortSignal) => { signal.throwIfAborted(); return store.list(input) })
  const get = vi.fn(async (id: string, signal: AbortSignal) => { signal.throwIfAborted(); return store.detail(id) })
  return { store, list, get, source: createTodoInputSource({ list, get }, key => zh[key]) }
}
afterEach(() => { for (const store of stores.splice(0)) store.close() })

describe('todo input references', () => {
  it('shows only the four active categories, drills with Tab and returns via breadcrumbs', async () => {
    const { store, source } = setup()
    const todo = store.create({ title: '发布插件' })
    const folders = await source.candidates(session, request())
    expect(folders.map(item => item.name)).toEqual(['待处理', '进行中', '待回复', '待审核'])
    expect(folders[0]).toMatchObject({ description: '1', drill: true })
    expect(source.onPick({ ...pick(folders[0]!), action: 'drill' })).toEqual({ text: '@todo/pending/', continue: true })
    expect(source.onPick(pick(folders[0]!))).toEqual({ text: '@todo/pending/', continue: true })
    const items = await source.candidates(session, request('todo/pending/'))
    expect(items).toMatchObject([{ name: todo.title, value: todo.id }])
    expect(items[0]!.drill).toBeUndefined()
    expect(source.onPick(pick(items[0]!))).toMatchObject({ insert: { source: TODO_SOURCE, ref: todo.id, label: todo.title } })
    expect(source.onPick({ ...pick(items[0]!), action: 'drill' })).toBeUndefined()
    const header = source.header!(session, { query: 'todo/pending/', drilled: true })!
    expect(header.map(item => item.label)).toEqual(['个人待办', '待处理'])
    expect(source.onPick({ ...pick({ name: header[0]!.label, value: header[0]!.value }), action: 'drill' })).toEqual({ text: '@', continue: true })
    expect(source.header!(session, { query: '', drilled: false })).toBeUndefined()
  })

  it('searches current Host data within the category and excludes archived todos', async () => {
    const { store, source, list } = setup()
    const todo = store.create({ title: '发布插件', notes: '核对文档', assignee: '小明' })
    const archived = store.create({ title: '归档插件' })
    store.archive(archived.id)
    for (const query of ['发布', '文档', '小明']) {
      expect(await source.candidates(session, request(`todo/pending/${query}`))).toMatchObject([{ value: todo.id }])
    }
    expect(await source.candidates(session, request('todo/pending/插件'))).toHaveLength(1)
    expect(await source.candidates(session, request('todo/in_review/'))).toEqual([])
    expect(list).toHaveBeenLastCalledWith({ statuses: ['in_review'], search: '', limit: 50 }, expect.any(AbortSignal))
    expect(await source.candidates(session, request('待回复'))).toMatchObject([{ value: '@todo/blocked/' }])
    expect(await source.candidates(session, request('todo/pending/不存在'))).toEqual([])
    store.update(todo.id, { title: '新标题' })
    expect(await source.candidates(session, request('todo/pending/新标题'))).toMatchObject([{ value: todo.id }])
  })

  it('resolves latest details when sending and rejects deleted references', async () => {
    const { store, source } = setup()
    const todo = store.create({ title: '旧标题' })
    await source.candidates(session, request('todo/pending/'))
    store.update(todo.id, { title: '新标题', notes: '最新说明' })
    const text = await source.codec!.serialize(todo.id, request().signal)
    expect(text).toContain('新标题')
    expect(text).toContain('最新说明')
    expect(text).toContain(todo.id)
    expect(source.codec!.clipboardText(todo.id)).toBe(`personal-todo:${todo.id}`)
    store.delete(todo.id)
    await expect(source.codec!.serialize(todo.id, request().signal)).rejects.toThrow()
  })

  it('ignores quoted paths, unrelated queries and excluded categories without requests', async () => {
    const { source, list } = setup()
    for (const query of ['todo/completed/', 'todo/cancelled/', 'todo/archived/', 'other/path', 'xyz', `todo/pending/${'a'.repeat(501)}`]) {
      expect(await source.candidates(session, request(query))).toEqual([])
    }
    expect(await source.candidates(session, { ...request(), quoted: true })).toEqual([])
    expect(list).not.toHaveBeenCalled()
    expect(source.onPick(pick({ name: 'missing' }))).toBeUndefined()
  })

  it('propagates failures and discards responses after cancellation', async () => {
    const { source, list, get } = setup()
    list.mockRejectedValueOnce(new Error('offline'))
    await expect(source.candidates(session, request())).rejects.toThrow('offline')
    const controller = new AbortController()
    controller.abort()
    await expect(source.candidates(session, request('', controller.signal))).rejects.toThrow()
    await expect(source.codec!.serialize('id', controller.signal)).rejects.toThrow()
    expect(get).not.toHaveBeenCalled()
    const late = new AbortController()
    list.mockImplementationOnce(async () => {
      late.abort()
      return { todos: [], total: 0, hasMore: false, counts: { pending: 0, inProgress: 0, blocked: 0, inReview: 0, completed: 0, cancelled: 0, archived: 0 } }
    })
    await expect(source.candidates(session, request('todo/pending/', late.signal))).rejects.toThrow()
  })

  it('bounds long lists and tells the user to narrow their search', async () => {
    const { store, source } = setup()
    for (let index = 0; index < 51; index++) store.create({ title: `待办 ${index}` })
    const items = await source.candidates(session, request('todo/pending/'))
    expect(items).toHaveLength(50)
    expect(items[0]!.section).toContain('显示前 50 项')
    expect(await source.candidates(session, request('todo/pending/50'))).toHaveLength(1)
  })
})
