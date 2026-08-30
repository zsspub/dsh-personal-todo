import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PersonalTodoService from '../src/index.ts'
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
  }
  execute(args: unknown, run: ToolRun): Promise<unknown>
}

class SessionControllerStub extends Service {
  readonly created: string[] = []
  readonly messages: Array<{ readonly sessionId: string; readonly text: string }> = []

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
    return Promise.resolve({
      agent: {
        id: sessionId,
        followup: message => { this.messages.push({ sessionId, text: message.content[0].text }) },
      },
    })
  }
}

const contexts: Context[] = []
const signal = new AbortController().signal

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionControllerStub)
  await ctx.plugin(PersonalTodoService, {
    databasePath: ':memory:',
    defaultListLimit: 50,
    maxListLimit: 200,
  })
  const tools: CapturedTool[] = []
  applyTools({
    personalTodo: ctx.personalTodo,
    tools: { register: (tool: CapturedTool) => { tools.push(tool); return () => undefined } },
  } as unknown as Context)
  return {
    ctx,
    sessions: ctx.sessionController as SessionControllerStub,
    tools: new Map(tools.map(tool => [tool.name, tool])),
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
      properties: { title: { type: 'string' } },
      required: ['title'],
    })
    expect(tools.get('personal_todo_list')?.output.schema).toMatchObject({
      type: 'object',
      properties: { todos: { type: 'array' }, total: { type: 'integer' }, hasMore: { type: 'boolean' } },
      required: ['todos', 'total', 'counts', 'hasMore'],
    })
  })

  it('drives one todo from creation through a Session and explicit user approval', async () => {
    const { ctx, sessions, tools } = await setup()
    const added = await tools.get('personal_todo_add')?.execute({
      title: 'Shared state',
      notes: 'created by a tool',
      priority: 'high',
      tags: ['DSH'],
    } satisfies CreateTodoInput, run()) as Awaited<ReturnType<typeof ctx.personalTodo.create>>

    const started = await ctx.personalTodo.start({ id: added.id }, signal)
    expect(started).toMatchObject({ status: 'in_progress', primarySessionId: expect.any(String) })
    expect(sessions.created).toEqual([started.primarySessionId])
    expect(sessions.messages[0]?.text).toContain(`personal_todo_submit_review with id ${added.id}`)

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
