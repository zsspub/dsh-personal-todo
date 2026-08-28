import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import PersonalTodoService from '../src/index.ts'
import { apply as applyTools } from '../src/tools.ts'
import type { CreateTodoInput, ListTodoInput, UpdateTodoRequest } from '../src/types.ts'

interface ToolRun {
  readonly signal: AbortSignal
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

const contexts: Context[] = []
const signal = new AbortController().signal

async function setup() {
  const ctx = new Context()
  contexts.push(ctx)
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
  return { ctx, tools: new Map(tools.map(tool => [tool.name, tool])) }
}

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

describe('Host Remote service and Agent tools', () => {
  it('publishes the four stable tool schemas', async () => {
    const { tools } = await setup()
    expect([...tools.keys()]).toEqual([
      'personal_todo_add',
      'personal_todo_list',
      'personal_todo_update',
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

  it('shares one authoritative state across Remote methods and all four tools', async () => {
    const { ctx, tools } = await setup()
    const added = await tools.get('personal_todo_add')?.execute({
      title: 'Shared state',
      notes: 'created by a tool',
      priority: 'high',
      tags: ['DSH'],
    } satisfies CreateTodoInput, { signal }) as Awaited<ReturnType<typeof ctx.personalTodo.create>>

    expect((await ctx.personalTodo.list({}, signal)).todos).toMatchObject([{ id: added.id, title: 'Shared state', tags: ['dsh'] }])
    const updated = await tools.get('personal_todo_update')?.execute({ id: added.id, status: 'completed' }, { signal })
    expect(updated).toMatchObject({ id: added.id, status: 'completed', completedAt: expect.any(String) })
    const listed = await tools.get('personal_todo_list')?.execute({ statuses: ['completed'] } satisfies ListTodoInput, { signal })
    expect(listed).toMatchObject({ total: 1, counts: { completed: 1 }, todos: [{ id: added.id }] })
    expect(tools.get('personal_todo_list')?.output.render({}, listed)[0]?.text).toContain(added.id)
    expect(await tools.get('personal_todo_delete')?.execute({ id: added.id }, { signal })).toEqual({ id: added.id, deleted: true })
    expect((await ctx.personalTodo.list({ statuses: ['completed'] }, signal)).total).toBe(0)
  })

  it('validates tool inputs and reports unknown ids through the same service errors', async () => {
    const { tools } = await setup()
    await expect(tools.get('personal_todo_add')?.execute({}, { signal })).rejects.toThrow('title')
    await expect(tools.get('personal_todo_update')?.execute({ id: 'missing' } satisfies Partial<UpdateTodoRequest>, { signal })).rejects.toThrow('at least one mutable field')
    await expect(tools.get('personal_todo_delete')?.execute({ id: 'missing' }, { signal })).rejects.toThrow('was not found')
  })

  it('checks cancellation before synchronous Remote operations', async () => {
    const { ctx } = await setup()
    const controller = new AbortController()
    controller.abort(new Error('stop'))
    expect(() => ctx.personalTodo.list({}, controller.signal)).toThrow('stop')
  })
})
