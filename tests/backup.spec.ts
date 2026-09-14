import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { parseTodoBackup, TODO_BACKUP_MAX_BYTES } from '../src/backup.ts'
import { TodoStore } from '../src/host/store.ts'
import type { TodoBackup } from '../src/types.ts'

const stores: TodoStore[] = []
const directories: string[] = []
const now = Date.parse('2026-09-14T10:00:00.000Z')

function store(databasePath = ':memory:', createEventId = randomUUID): TodoStore {
  const instance = new TodoStore({
    databasePath, journalMode: 'wal', busyTimeoutMs: 1000, defaultListLimit: 1, maxListLimit: 2,
  }, { now: () => now, createEventId })
  stores.push(instance)
  return instance
}

function snapshot(instance: TodoStore): TodoBackup {
  return JSON.parse(instance.exportData().json) as TodoBackup
}

function activeBackup(): TodoBackup {
  const source = store()
  const todo = source.create({ title: '正在执行' })
  source.beginRun(todo.id, 'run-active', 'session-primary')
  source.linkRelatedSession('session-primary', 'session-child')
  source.linkRelatedSession('session-child', 'session-nested')
  source.progress(todo.id, 'session-primary', '已完成第一步')
  return snapshot(source)
}

afterEach(() => {
  for (const instance of stores.splice(0)) instance.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('个人待办 JSON 备份', () => {
  it('版本 2 保留人工进行中，不把任务进度当作执行状态', () => {
    const source = store()
    const manual = source.create({ title: '下班取快递' })
    source.setStatus(manual.id, 'in_progress')
    const target = store()
    const backup = source.exportData().json
    expect(JSON.parse(backup).version).toBe(2)
    expect(target.importData(backup)).toEqual({ imported: 1, skipped: 0, resetToPending: 0 })
    expect(snapshot(target)).toEqual(snapshot(source))
    expect(target.recoverableTodos()).toEqual([])
  })

  it.each(['blocked', 'in_review'] as const)('兼容版本 1 的 %s，保留结果、问题及会话关联', status => {
    const source = store()
    const todo = source.create({ title: '旧版本任务' })
    source.beginRun(todo.id, 'old-run', 'old-session')
    if (status === 'blocked') source.block({ id: todo.id, question: '需要补充' }, 'old-session')
    else source.submitReview({ id: todo.id, summary: '已完成工作' }, 'old-session')
    const backup = snapshot(source)
    const json = JSON.stringify({
      ...backup, version: 1,
      todos: backup.todos.map(detail => ({ ...detail, todo: { ...detail.todo, status, executionStatus: undefined } })),
    })
    const target = store()
    expect(target.importData(json)).toEqual({ imported: 1, skipped: 0, resetToPending: 0 })
    expect(snapshot(target)).toEqual(backup)
    expect(target.recoverableTodos()).toEqual([])
  })

  it('导出全部状态、归档和完整历史，不受分页及 200 条活动限制', () => {
    const source = store()
    source.create({ title: '待处理', assignee: '张三', notes: '备注', priority: 'high', tags: ['工作'], dueAt: '2026-10-01T12:00:00Z' })
    const running = source.create({ title: '进行中' })
    source.beginRun(running.id, 'running-run', 'running-session')
    const blocked = source.create({ title: '待回复' })
    source.beginRun(blocked.id, 'blocked-run', 'blocked-session')
    source.block({ id: blocked.id, question: '请提供输入' }, 'blocked-session')
    const review = source.create({ title: '待审核' })
    source.beginRun(review.id, 'review-run', 'review-session')
    source.submitReview({ id: review.id, summary: '等待审核', verification: '测试通过', risk: '待确认' }, 'review-session')
    const history = source.create({ title: '已完成归档' })
    source.beginRun(history.id, 'history-run', 'history-session')
    source.linkRelatedSession('history-session', 'child-session')
    source.linkRelatedSession('child-session', 'nested-session')
    for (let index = 0; index < 210; index++) source.progress(history.id, 'history-session', `进度 ${index}`)
    source.submitReview({ id: history.id, summary: '首轮完成' }, 'history-session')
    source.requestChanges({ id: history.id, feedback: '补充测试' }, 'second-run')
    source.submitReview({ id: history.id, summary: '第二轮完成' }, 'history-session')
    source.approve(history.id)
    source.archive(history.id)
    const completed = source.create({ title: '已完成' })
    source.approve(completed.id)
    const exported = source.exportData()
    expect(exported.filename).toBe('personal-todo-2026-09-14T10-00-00-000Z.json')
    const backup = parseTodoBackup(exported.json)
    expect(backup.todos).toHaveLength(6)
    expect(source.list().todos).toHaveLength(1)
    expect(source.detail(history.id).events).toHaveLength(200)
    expect(backup.todos.find(detail => detail.todo.id === history.id)).toMatchObject({
      runs: [{ id: 'second-run' }, { id: 'history-run' }],
      sessions: [{ sessionId: 'history-session' }, { sessionId: 'child-session' }, { sessionId: 'nested-session' }],
      events: expect.any(Array),
    })
    expect(backup.todos.find(detail => detail.todo.id === history.id)!.events.length).toBeGreaterThan(210)
    const target = store()
    expect(target.importData(exported.json)).toEqual({ imported: 6, skipped: 0, resetToPending: 1 })
    for (const detail of backup.todos.filter(detail => detail.todo.executionStatus !== 'running')) {
      expect(snapshot(target).todos.find(candidate => candidate.todo.id === detail.todo.id)).toEqual(detail)
    }
  })

  it('往返保留已取消待办及归档状态', () => {
    const directory = mkdtempSync(join(tmpdir(), 'todo-cancelled-'))
    directories.push(directory)
    const path = join(directory, 'todos.sqlite3')
    const source = store(path)
    const todo = source.create({ title: '已取消' })
    const database = new DatabaseSync(path)
    database.prepare("UPDATE todos SET status = 'cancelled' WHERE id = ?").run(todo.id)
    database.close()
    source.archive(todo.id)
    const target = store()
    target.importData(source.exportData().json)
    expect(snapshot(target)).toEqual(snapshot(source))
  })

  it('幂等导入且不覆盖同 ID 本地修改和执行状态', () => {
    const backup = activeBackup()
    const target = store()
    expect(target.importData(JSON.stringify(backup))).toEqual({ imported: 1, skipped: 0, resetToPending: 1 })
    const id = backup.todos[0]!.todo.id
    target.update(id, { title: '本地修改' })
    target.beginRun(id, 'local-run', 'session-primary')
    const before = snapshot(target)
    expect(target.importData(JSON.stringify(backup))).toEqual({ imported: 0, skipped: 1, resetToPending: 0 })
    expect(snapshot(target)).toEqual(before)
  })

  it('执行中转待处理并保留归档、摘要和会话，不在重新打开后恢复执行', () => {
    const backup = activeBackup()
    const original = backup.todos[0]!
    const archived = { ...original, todo: { ...original.todo, archivedAt: original.todo.createdAt } }
    const directory = mkdtempSync(join(tmpdir(), 'todo-import-reopen-'))
    directories.push(directory)
    const path = join(directory, 'todos.sqlite3')
    const target = store(path)
    target.importData(JSON.stringify({ ...backup, todos: [archived] }))
    const imported = target.detail(original.todo.id)
    expect(imported.todo).toEqual({
      ...archived.todo, status: 'pending', executionStatus: 'stopped', activeRunId: null, blockedReason: null,
      revision: original.todo.revision + 1, updatedAt: new Date(now).toISOString(),
    })
    expect(imported.runs).toEqual(original.runs.map(run => ({ ...run, status: 'cancelled', finishedAt: new Date(now).toISOString() })))
    expect(imported.sessions).toEqual(original.sessions)
    expect(imported.events.slice(1)).toEqual(original.events)
    expect(imported.events[0]).toMatchObject({ type: 'updated', runId: 'run-active', message: expect.stringContaining('转为待处理') })
    target.close()
    expect(store(path).recoverableTodos()).toEqual([])
  })

  it.each([
    ['格式标识', (backup: TodoBackup) => ({ ...backup, format: 'other' })],
    ['版本', (backup: TodoBackup) => ({ ...backup, version: 3 })],
    ['重复待办', (backup: TodoBackup) => ({ ...backup, todos: [...backup.todos, ...backup.todos] })],
    ['无效标题', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], todo: { ...backup.todos[0]!.todo, title: 1 } }] })],
    ['无效时间', (backup: TodoBackup) => ({ ...backup, exportedAt: '2026-02-30T12:00:00Z' })],
    ['无效状态', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], todo: { ...backup.todos[0]!.todo, status: 'other' } }] })],
    ['外部 Run 引用', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], events: [{ ...backup.todos[0]!.events[0], runId: 'missing' }] }] })],
    ['错误归属', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], runs: [{ ...backup.todos[0]!.runs[0], todoId: 'other' }] }] })],
    ['缺少主会话', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], sessions: [] }] })],
    ['循环会话引用', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], sessions: backup.todos[0]!.sessions.map(session => session.role === 'related' ? { ...session, parentSessionId: session.sessionId } : session) }] })],
    ['重复事件', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], events: [...backup.todos[0]!.events, ...backup.todos[0]!.events] }] })],
    ['重复执行序号', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], runs: [...backup.todos[0]!.runs, { ...backup.todos[0]!.runs[0], id: 'another-run' }] }] })],
    ['重复 Run ID', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], runs: [...backup.todos[0]!.runs, ...backup.todos[0]!.runs] }] })],
    ['重复 Session ID', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], sessions: [...backup.todos[0]!.sessions, ...backup.todos[0]!.sessions] }] })],
    ['活动 Run 状态不匹配', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], runs: backup.todos[0]!.runs.map(run => ({ ...run, status: 'submitted' })) }] })],
    ['整数溢出', (backup: TodoBackup) => ({ ...backup, todos: [{ ...backup.todos[0], todo: { ...backup.todos[0]!.todo, revision: Number.MAX_SAFE_INTEGER } }] })],
  ])('拒绝%s，已有数据不变', (_name, mutate) => {
    const target = store()
    target.create({ title: '保留本地数据' })
    const before = snapshot(target)
    expect(() => target.importData(JSON.stringify(mutate(activeBackup())))).toThrow()
    expect(snapshot(target)).toEqual(before)
  })

  it.each(['todo_runs', 'todo_events', 'todo_sessions'] as const)('拒绝 %s 跨待办标识冲突并回滚先前插入', table => {
    const backup = activeBackup()
    const incoming = backup.todos[0]!
    const target = store()
    const local = target.create({ title: '本地待办' })
    if (table === 'todo_runs') target.beginRun(local.id, incoming.runs[0]!.id, 'local-session')
    if (table === 'todo_sessions') target.beginRun(local.id, 'local-run', incoming.sessions[0]!.sessionId)
    const conflicting = table === 'todo_events'
      ? { ...incoming, events: [{ ...incoming.events[0]!, id: target.detail(local.id).events[0]!.id }] }
      : incoming
    const other = store()
    other.create({ title: '在冲突前插入' })
    const before = snapshot(target)
    expect(() => target.importData(JSON.stringify({ ...backup, todos: [...snapshot(other).todos, conflicting] }))).toThrow('导入冲突')
    expect(snapshot(target)).toEqual(before)
  })

  it('数据库写入失败时完整回滚', () => {
    const backup = activeBackup()
    const target = store(':memory:', () => backup.todos[0]!.events[0]!.id as ReturnType<typeof randomUUID>)
    expect(() => target.importData(JSON.stringify(backup))).toThrow('未写入任何数据')
    expect(snapshot(target).todos).toEqual([])
  })

  it('接受空备份和 UTF-8 BOM；拒绝无效 JSON 和过大备份', () => {
    const target = store()
    const json = target.exportData().json
    expect(target.importData(`\uFEFF${json}`)).toEqual({ imported: 0, skipped: 0, resetToPending: 0 })
    expect(target.importData(json.padEnd(TODO_BACKUP_MAX_BYTES, ' '))).toEqual({ imported: 0, skipped: 0, resetToPending: 0 })
    expect(() => target.importData('{')).toThrow('不是有效的 JSON')
    expect(() => target.importData('中'.repeat(Math.ceil(TODO_BACKUP_MAX_BYTES / 3)))).toThrow('20 MiB')
  })

  it('过大导出明确失败，不返回截断备份', () => {
    const target = store()
    const todo = target.create({ title: '大量历史' })
    target.beginRun(todo.id, 'large-run', 'large-session')
    for (let index = 0; index < 3800; index++) target.progress(todo.id, 'large-session', '中'.repeat(2000))
    expect(() => target.exportData()).toThrow('20 MiB')
    expect(target.get(todo.id).status).toBe('in_progress')
  })
})
