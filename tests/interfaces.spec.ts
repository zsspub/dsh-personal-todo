import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonalTodoService from '../src/index.ts'
import { TodoStore } from '../src/host/store.ts'
import { apply as applyTools, codexDelegationPrompt } from '../src/tools.ts'
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

interface CodexDelegateStub {
  readonly genericToolName: string
  dispatch(request: unknown): Promise<{
    readonly kind: 'background'
    readonly jobId: string
    readonly threadId: string
    readonly codexUrl: string
  }>
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
  codexDelegate?: CodexDelegateStub,
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
  const guards: Array<(exec: { readonly name: string; readonly agent?: { readonly id: string } }) => string | undefined> = []
  const toolContext = {
    personalTodo: ctx.personalTodo,
    tools: {
      register: (tool: CapturedTool) => { tools.push(tool); return () => undefined },
      guard: (guard: (exec: { readonly name: string; readonly agent?: { readonly id: string } }) => string | undefined) => {
        guards.push(guard)
        return () => undefined
      },
    },
    get: (name: string) => name === 'codexDelegate' ? codexDelegate : undefined,
    inject: (names: readonly string[], register: (scope: Context) => void) => {
      if (names.includes('codexDelegate') && codexDelegate !== undefined) register(toolContext as unknown as Context)
      return undefined
    },
  }
  applyTools(toolContext as unknown as Context)
  return {
    ctx,
    sessions: ctx.sessionController as unknown as SessionControllerStub,
    tools: new Map(tools.map(tool => [tool.name, tool])),
    guards,
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
    const { tools } = await setup()
    expect([...tools.keys()]).toEqual([
      'personal_todo_add',
      'personal_todo_list',
      'personal_todo_update',
      'personal_todo_progress',
      'personal_todo_block',
      'personal_todo_submit_review',
      'personal_todo_delete',
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

  it('delegates exact stored todo text and denies direct Codex bypasses', async () => {
    const dispatch = vi.fn().mockResolvedValue({
      kind: 'background',
      jobId: 'codex-1',
      threadId: 'thread-1',
      codexUrl: 'codex://threads/thread-1',
    })
    const delegate: CodexDelegateStub = { genericToolName: 'codex_task', dispatch }
    const { ctx, tools, guards } = await setup(':memory:', 'idle', delegate)
    const added = await ctx.personalTodo.create({
      title: 'Audit sharing',
      notes: 'Keep this exact\nsecond line',
    }, signal)
    const started = await ctx.personalTodo.start({ id: added.id }, signal)
    const primaryId = started.primarySessionId as string
    const tool = tools.get('personal_todo_delegate_codex')

    expect(tool?.parameters).toMatchObject({
      properties: { id: { type: 'string' }, cwd: { type: 'string' } },
      required: ['id'],
    })
    const value = await tool?.execute({ id: added.id, cwd: '/workspace/kiwis2' }, run(primaryId))
    const expectedPrompt = codexDelegationPrompt(added)
    expect(dispatch).toHaveBeenCalledWith({
      label: added.title,
      prompt: expectedPrompt,
      owner: { id: primaryId },
      signal,
      cwd: '/workspace/kiwis2',
    })
    expect(value).toMatchObject({
      description: added.title,
      source: {
        title: added.title,
        notes: added.notes,
        revision: started.revision,
        prompt: expectedPrompt,
      },
    })
    expect(tool?.output.presentationMeta?.({}, value)).toMatchObject({
      kind: 'codex-task',
      description: added.title,
      source: { prompt: expectedPrompt },
    })

    await expect(tool?.execute({ id: added.id, prompt: 'rewritten' }, run(primaryId)))
      .rejects.toThrow(/accepts only id and cwd/)
    expect(dispatch).toHaveBeenCalledTimes(1)

    ctx.emit('session/created', {
      id: 'child-1',
      header: { parentSession: primaryId },
    } as never)
    expect(guards).toHaveLength(1)
    expect(guards[0]?.({ name: 'codex_task', agent: { id: primaryId } })).toMatch(/must use personal_todo_delegate_codex/)
    expect(guards[0]?.({ name: 'codex_task', agent: { id: 'child-1' } })).toMatch(/return the work to the primary Session/)
    expect(guards[0]?.({ name: 'codex_task', agent: { id: 'unrelated' } })).toBeUndefined()
    await expect(tool?.execute({ id: added.id }, run('child-1'))).rejects.toThrow(/does not own todo/)
  })

  it('drives one todo from creation through a Session and explicit user approval', async () => {
    const { ctx, sessions, tools } = await setup()
    const added = await tools.get('personal_todo_add')?.execute({
      title: 'Shared state',
      notes: 'created by a tool',
      assignee: 'Alice',
      priority: 'high',
      tags: ['DSH'],
    } satisfies CreateTodoInput, run()) as Awaited<ReturnType<typeof ctx.personalTodo.create>>

    const started = await ctx.personalTodo.start({ id: added.id }, signal)
    expect(started).toMatchObject({ assignee: 'Alice', status: 'in_progress', primarySessionId: expect.any(String) })
    expect(sessions.created).toEqual([started.primarySessionId])
    expect(sessions.messages[0]?.text).toContain(`personal_todo_submit_review (id ${added.id})`)
    expect(sessions.messages[0]?.text).toContain('Assignee: Alice')
    expect(sessions.messages[0]?.text).toContain('personal-todo-execution skill')
    expect(sessions.messages[0]?.text).toContain('Do not mark the todo completed')

    const agentRun = run(started.primarySessionId as string)
    expect(await tools.get('personal_todo_progress')?.execute({ id: added.id, message: 'Implemented it' }, agentRun)).toMatchObject({ latestSummary: 'Implemented it' })
    expect(await tools.get('personal_todo_submit_review')?.execute({
      id: added.id,
      summary: 'Ready for review',
      verification: 'Tests passed',
      risk: null,
    }, agentRun)).toMatchObject({ status: 'in_review' })
    expect(agentRun.concludeTurn).toHaveBeenCalledOnce()

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
    expect(sessions.messages[0]?.text).toContain('after the DSH service restart')
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

  it('surfaces an Agent question in the todo and delivers the user reply to the same Session', async () => {
    const { ctx, sessions, tools } = await setup()
    const todo = await ctx.personalTodo.create({ title: 'Clarify' }, signal)
    const started = await ctx.personalTodo.start({ id: todo.id }, signal)
    const agentRun = run(started.primarySessionId as string)

    expect(await tools.get('personal_todo_block')?.execute({ id: todo.id, question: 'Which option?' }, agentRun)).toMatchObject({
      status: 'blocked', blockedReason: 'Which option?',
    })
    expect(agentRun.concludeTurn).toHaveBeenCalledOnce()
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

  it('validates tool inputs, Agent ownership, and cancellation', async () => {
    const { ctx, tools } = await setup()
    await expect(tools.get('personal_todo_add')?.execute({}, run())).rejects.toThrow('title')
    await expect(tools.get('personal_todo_update')?.execute({ id: 'missing' } satisfies Partial<UpdateTodoRequest>, run())).rejects.toThrow('at least one editable field')
    await expect(tools.get('personal_todo_progress')?.execute({ id: 'missing', message: 'x' }, run())).rejects.toThrow('require an Agent Session')
    await expect(tools.get('personal_todo_delete')?.execute({ id: 'missing' }, run())).rejects.toThrow('was not found')

    const controller = new AbortController()
    controller.abort(new Error('stop'))
    expect(() => ctx.personalTodo.list({}, controller.signal)).toThrow('stop')
  })
})
