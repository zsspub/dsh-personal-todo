import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonalTodoService from '../src/index.ts'
import { TodoStore } from '../src/host/store.ts'
import { apply as applyTools } from '../src/tools.ts'
import type { CreateTodoInput, ListTodoInput, UpdateTodoRequest } from '../src/types.ts'

interface ToolRun {
  readonly signal: AbortSignal
  readonly agent?: { readonly id: string }
  concludeTurn(): void
}

interface CapturedTool {
  readonly name: string
  readonly parameters: Record<string, unknown>
  readonly output: {
    readonly schema: Record<string, unknown>
    render(args: unknown, value: unknown): Array<{ readonly type: string; readonly text?: string }>
    presentationMeta?(args: unknown, value: unknown): unknown
  }
  execute(args: unknown, run: ToolRun): Promise<unknown>
}

class SessionControllerStub extends Service {
  readonly created: string[] = []
  readonly resolved: string[] = []
  readonly messages: Array<{ readonly sessionId: string; readonly text: string }> = []
  agentStatus: 'idle' | 'running' = 'idle'

  constructor(ctx: Context) {
    super(ctx, 'sessionController')
  }

  create(request: { readonly sessionId: string }): Promise<{ readonly sessionId: string }> {
    this.created.push(request.sessionId)
    return Promise.resolve({ sessionId: request.sessionId })
  }

  resolveAgent(sessionId: string): Promise<{ readonly agent: {
    readonly id: string
    followup(message: { readonly content: readonly [{ readonly text: string }] }): void
  } }> {
    this.resolved.push(sessionId)
    return Promise.resolve({
      agent: {
        id: sessionId,
        status: this.agentStatus,
        followup: message => { this.messages.push({ sessionId, text: message.content[0].text }) },
      },
    })
  }
}

class SessionsStub extends Service {
  constructor(ctx: Context) {
    super(ctx, 'sessions')
  }
}

const contexts: Context[] = []
const temporaryDirectories: string[] = []
const signal = new AbortController().signal

async function setup(
  databasePath = ':memory:',
  agentStatus: 'idle' | 'running' = 'idle',
) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionControllerStub)
  const sessionController = ctx.sessionController as unknown as SessionControllerStub
  sessionController.agentStatus = agentStatus
  await ctx.plugin(SessionsStub)
  await ctx.plugin(PersonalTodoService, {
    databasePath,
    defaultListLimit: 50,
    maxListLimit: 200,
  })
  const tools: CapturedTool[] = []
  const guard = vi.fn()
  const inject = vi.fn()
  const toolContext = {
    personalTodo: ctx.personalTodo,
    tools: {
      register: (tool: CapturedTool) => { tools.push(tool); return () => undefined },
      guard,
    },
    inject,
  }
  applyTools(toolContext as unknown as Context)
  return {
    ctx,
    sessions: ctx.sessionController as unknown as SessionControllerStub,
    tools: new Map(tools.map(tool => [tool.name, tool])),
    guard,
    inject,
  }
}

function run(sessionId?: string) {
  return {
    signal,
    ...(sessionId === undefined ? {} : { agent: { id: sessionId } }),
    concludeTurn: vi.fn(),
  }
}

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('Host Remote service and Agent tools', () => {
  it('publishes CRUD plus Agent-owned progress, blocking, and review tools', async () => {
    const { tools, guard, inject } = await setup()
    expect(guard).not.toHaveBeenCalled()
    expect(inject).not.toHaveBeenCalled()
    expect([...tools.keys()]).toEqual([
      'personal_todo_add',
      'personal_todo_list',
      'personal_todo_update',
      'personal_todo_progress',
      'personal_todo_block',
      'personal_todo_submit_review',
      'personal_todo_delete',
      'personal_todo_export',
      'personal_todo_import',
    ])
    expect(tools.get('personal_todo_add')?.parameters).toMatchObject({
      type: 'object',
      properties: { title: { type: 'string' }, assignee: { oneOf: [{ type: 'string' }, { type: 'null' }] } },
      required: ['title'],
    })
    expect(tools.get('personal_todo_list')?.output.schema).toMatchObject({
      type: 'object',
      properties: { todos: { type: 'array' }, total: { type: 'integer' }, hasMore: { type: 'boolean' } },
      required: ['todos', 'total', 'counts', 'hasMore'],
    })
    expect(tools.get('personal_todo_list')?.parameters).toMatchObject({
      type: 'object',
      properties: { archived: { type: 'boolean' } },
    })
  })

  it.each([undefined, 'none', 'low', 'medium', 'high'] as const)('Agent 创建待办时优先级 %s 的保存和查询结果', async priority => {
    const { ctx, tools } = await setup()
    const added = await tools.get('personal_todo_add')?.execute({
      title: '优先级验证',
      ...(priority === undefined ? {} : { priority }),
    }, run()) as Awaited<ReturnType<typeof ctx.personalTodo.create>>
    expect(added.priority).toBe(priority ?? 'medium')
    expect(await tools.get('personal_todo_list')?.execute({}, run())).toMatchObject({
      todos: [{ id: added.id, priority: priority ?? 'medium' }],
    })
    await tools.get('personal_todo_update')?.execute({ id: added.id, title: '更新标题' }, run())
    expect((await ctx.personalTodo.get({ id: added.id }, signal)).todo.priority).toBe(priority ?? 'medium')
  })

  it.each(['pending', 'in_progress', 'blocked'] as const)('现有 approve API 从 %s 完成待办，工具可查询最终状态', async (status) => {
    const { ctx, tools } = await setup()
    const todo = await ctx.personalTodo.create({ title: '直接完成' }, signal)
    if (status !== 'pending') {
      const started = await ctx.personalTodo.start({ id: todo.id }, signal)
      if (status === 'blocked') await ctx.personalTodo.block({ id: todo.id, question: '请选择' }, started.primarySessionId as string)
    }
    expect(await ctx.personalTodo.approve({ id: todo.id }, signal)).toMatchObject({
      status: 'completed', completedAt: expect.any(String), activeRunId: null, blockedReason: null, reviewRound: 0,
    })
    expect(await tools.get('personal_todo_list')?.execute({ statuses: ['completed'] }, run())).toMatchObject({
      total: 1, todos: [{ id: todo.id, status: 'completed' }],
    })
  })

  it('drives one todo from creation through a Session and explicit user approval', async () => {
    const { ctx, sessions, tools } = await setup()
    const added = await tools.get('personal_todo_add')?.execute({
      title: 'Shared state',
      notes: 'created by a tool',
      assignee: 'Alice',
      priority: 'high',
      dueAt: '2026-09-20T10:00:00.000Z',
      tags: ['DSH'],
    } satisfies CreateTodoInput, run()) as Awaited<ReturnType<typeof ctx.personalTodo.create>>

    const started = await ctx.personalTodo.start({ id: added.id }, signal)
    expect(started).toMatchObject({ assignee: 'Alice', status: 'in_progress', primarySessionId: expect.any(String) })
    expect(sessions.created).toEqual([started.primarySessionId])
    expect(sessions.messages[0]?.text).toBe([
      `执行个人待办 ${added.id}。`,
      '执行前请加载并遵循 personal-todo-execution Skill。',
      '',
      '标题：Shared state',
      '备注：created by a tool',
      '负责人：Alice',
      '优先级：高',
      '截止时间：2026-09-20T10:00:00.000Z',
      '标签：["dsh"]',
    ].join('\n'))

    const agentRun = run(started.primarySessionId as string)
    expect(await tools.get('personal_todo_progress')?.execute({ id: added.id, message: 'Implemented it' }, agentRun)).toMatchObject({ latestSummary: 'Implemented it' })
    expect(await tools.get('personal_todo_submit_review')?.execute({
      id: added.id,
      summary: 'Ready for review',
      verification: 'Tests passed',
      risk: null,
    }, agentRun)).toMatchObject({ status: 'in_review' })
    expect(agentRun.concludeTurn).not.toHaveBeenCalled()

    expect(await ctx.personalTodo.approve({ id: added.id }, signal)).toMatchObject({ status: 'completed' })
    const listed = await tools.get('personal_todo_list')?.execute({ statuses: ['completed'] } satisfies ListTodoInput, run())
    expect(listed).toMatchObject({ total: 1, counts: { completed: 1 }, todos: [{ id: added.id }] })
    expect(tools.get('personal_todo_list')?.output.render({}, listed)[0]?.text).toContain(added.id)

    expect(await ctx.personalTodo.archive({ id: added.id }, signal)).toMatchObject({ archivedAt: expect.any(String) })
    expect(await ctx.personalTodo.list({ statuses: ['completed'] }, signal)).toMatchObject({ total: 0, counts: { archived: 1 } })
    expect(await ctx.personalTodo.restore({ id: added.id }, signal)).toMatchObject({ archivedAt: null })
  })

  it('tracks newly published child Sessions as related todo conversations', async () => {
    const { ctx } = await setup()
    const todo = await ctx.personalTodo.create({ title: 'Delegate work' }, signal)
    const started = await ctx.personalTodo.start({ id: todo.id }, signal)
    ctx.emit('session/created', {
      id: 'child-1',
      header: { parentSession: started.primarySessionId },
    } as never)
    ctx.emit('session/created', {
      id: 'grandchild-1',
      header: { parentSession: 'child-1' },
    } as never)

    expect((await ctx.personalTodo.get({ id: todo.id }, signal)).sessions).toMatchObject([
      { sessionId: started.primarySessionId, role: 'primary', parentSessionId: null },
      { sessionId: 'child-1', role: 'related', parentSessionId: started.primarySessionId },
      { sessionId: 'grandchild-1', role: 'related', parentSessionId: 'child-1' },
    ])
  })

  it('resumes a durable in-progress todo after the Host service restarts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-personal-todo-recovery-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'todos.sqlite3')
    const persisted = new TodoStore({
      databasePath,
      journalMode: 'wal',
      busyTimeoutMs: 1_000,
      defaultListLimit: 50,
      maxListLimit: 200,
    })
    const todo = persisted.create({ title: 'Resume after restart' })
    persisted.beginRun(todo.id, 'run-1', 'session-1')
    persisted.close()

    const { ctx, sessions } = await setup(databasePath)
    await vi.waitFor(() => { expect(sessions.messages).toHaveLength(1) })
    expect(sessions.created).toEqual([])
    expect(sessions.messages[0]).toMatchObject({ sessionId: 'session-1' })
    expect(sessions.messages[0]?.text).toContain('DSH 服务重启后')
    expect(await ctx.personalTodo.get({ id: todo.id }, signal)).toMatchObject({ todo: { status: 'in_progress' } })
  })

  it('does not duplicate restart work already owned by a running Agent', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'dsh-personal-todo-running-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'todos.sqlite3')
    const persisted = new TodoStore({
      databasePath,
      journalMode: 'wal',
      busyTimeoutMs: 1_000,
      defaultListLimit: 50,
      maxListLimit: 200,
    })
    const todo = persisted.create({ title: 'Already running' })
    persisted.beginRun(todo.id, 'run-1', 'session-1')
    persisted.close()

    const { sessions } = await setup(databasePath, 'running')
    await vi.waitFor(() => { expect(sessions.resolved).toEqual(['session-1']) })
    expect(sessions.messages).toEqual([])
  })

  it('启动消息明确显示未设置的元信息', async () => {
    const { ctx, sessions } = await setup()
    const todo = await ctx.personalTodo.create({ title: '最小待办' }, signal)
    await ctx.personalTodo.start({ id: todo.id }, signal)
    expect(sessions.messages[0]?.text).toContain('备注：无补充备注。\n负责人：未分配。\n优先级：未设置\n截止时间：未设置\n标签：无')
  })

  it('surfaces an Agent question in the todo and delivers the user reply to the same Session', async () => {
    const { ctx, sessions, tools } = await setup()
    const todo = await ctx.personalTodo.create({ title: 'Clarify' }, signal)
    const started = await ctx.personalTodo.start({ id: todo.id }, signal)
    const agentRun = run(started.primarySessionId as string)

    expect(await tools.get('personal_todo_block')?.execute({ id: todo.id, question: 'Which option?' }, agentRun)).toMatchObject({
      status: 'blocked', blockedReason: 'Which option?',
    })
    expect(agentRun.concludeTurn).not.toHaveBeenCalled()
    expect(await ctx.personalTodo.reply({ id: todo.id, message: 'Use option A.' }, signal)).toMatchObject({ status: 'in_progress' })
    expect(sessions.messages.at(-1)?.text).toContain('Use option A.')
  })

  it('returns review feedback to the existing root Session', async () => {
    const { ctx, sessions } = await setup()
    const todo = await ctx.personalTodo.create({ title: 'Revise' }, signal)
    const started = await ctx.personalTodo.start({ id: todo.id }, signal)
    await ctx.personalTodo.submitReview({ id: todo.id, summary: 'First pass' }, started.primarySessionId as string)

    const revised = await ctx.personalTodo.requestChanges({ id: todo.id, feedback: 'Add coverage.' }, signal)
    expect(revised).toMatchObject({ status: 'in_progress', primarySessionId: started.primarySessionId })
    expect(sessions.created).toHaveLength(1)
    expect(sessions.messages.at(-1)?.text).toContain('Add coverage.')
    expect((await ctx.personalTodo.get({ id: todo.id }, signal)).runs).toHaveLength(2)
  })

  it('面板接口与 Agent 工具共用备份规则，导入不派发会话且重启不自动恢复', async () => {
    const source = await setup()
    const todo = await source.ctx.personalTodo.create({ title: '备份任务' }, signal)
    await source.ctx.personalTodo.start({ id: todo.id }, signal)
    const exported = await source.tools.get('personal_todo_export')!.execute({}, run()) as { filename: string; json: string }
    const remoteExport = await source.ctx.personalTodo.exportData({}, signal)
    expect(JSON.parse(exported.json).todos).toEqual(JSON.parse(remoteExport.json).todos)
    expect(exported.filename).toMatch(/^personal-todo-.*\.json$/u)
    const directory = mkdtempSync(join(tmpdir(), 'todo-import-service-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'todos.sqlite3')
    const target = await setup(path)
    expect(await target.tools.get('personal_todo_import')!.execute({ json: exported.json }, run()))
      .toEqual({ imported: 1, skipped: 0, resetToPending: 1 })
    expect(await target.ctx.personalTodo.importData({ json: exported.json }, signal))
      .toEqual({ imported: 0, skipped: 1, resetToPending: 0 })
    expect((await target.ctx.personalTodo.get({ id: todo.id }, signal)).todo.status).toBe('pending')
    expect(target.sessions.created).toEqual([])
    expect(target.sessions.messages).toEqual([])
    expect(target.sessions.resolved).toEqual([])
    const output = target.tools.get('personal_todo_import')!.output
    expect(output.schema).toMatchObject({
      properties: { imported: { type: 'integer' }, skipped: { type: 'integer' }, resetToPending: { type: 'integer' } },
    })
    expect(output.render({}, { imported: 1, skipped: 0, resetToPending: 1 })[0]?.text).toContain('"imported":1')
    await target.ctx.fiber.dispose()
    const reopened = await setup(path)
    expect(reopened.sessions.created).toEqual([])
    expect(reopened.sessions.messages).toEqual([])
    expect(reopened.sessions.resolved).toEqual([])
  })

  it('validates tool inputs, Agent ownership, and cancellation', async () => {
    const { ctx, tools } = await setup()
    await expect(tools.get('personal_todo_add')?.execute({}, run())).rejects.toThrow('title')
    await expect(tools.get('personal_todo_update')?.execute({ id: 'missing' } satisfies Partial<UpdateTodoRequest>, run())).rejects.toThrow('at least one editable field')
    await expect(tools.get('personal_todo_progress')?.execute({ id: 'missing', message: 'x' }, run())).rejects.toThrow('require an Agent Session')
    await expect(tools.get('personal_todo_delete')?.execute({ id: 'missing' }, run())).rejects.toThrow('was not found')

    const controller = new AbortController()
    controller.abort(new Error('stop'))
    expect(() => ctx.personalTodo.list({}, controller.signal)).toThrow('stop')
    expect(() => ctx.personalTodo.exportData({}, controller.signal)).toThrow('stop')
    expect(() => ctx.personalTodo.importData({ json: '{}' }, controller.signal)).toThrow('stop')
    await expect(tools.get('personal_todo_import')?.execute({}, run())).rejects.toThrow('json')
    await expect(tools.get('personal_todo_import')?.execute({ json: '{' }, run())).rejects.toThrow('JSON')
    await expect(tools.get('personal_todo_export')?.execute({}, { ...run(), signal: controller.signal })).rejects.toThrow('stop')
    await expect(tools.get('personal_todo_import')?.execute({ json: '{}' }, { ...run(), signal: controller.signal })).rejects.toThrow('stop')
  })
})
