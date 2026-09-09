/** 面向模型的待办创建、查询、编辑、进度、阻塞和审核工具。 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TODO_PRIORITIES, TODO_STATUSES } from './types.ts'

export const name = 'personal-todo-tools'
export const inject = ['tools', 'personalTodo']

const NULLABLE_STRING = { oneOf: [{ type: 'string' }, { type: 'null' }] } as const
const TODO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    title: { type: 'string', required: true },
    notes: { ...NULLABLE_STRING, required: true },
    assignee: { ...NULLABLE_STRING, required: true },
    status: { type: 'string', enum: [...TODO_STATUSES], required: true },
    priority: { type: 'string', enum: [...TODO_PRIORITIES], required: true },
    dueAt: { ...NULLABLE_STRING, required: true },
    tags: { type: 'array', items: { type: 'string' }, required: true },
    primarySessionId: { ...NULLABLE_STRING, required: true },
    activeRunId: { ...NULLABLE_STRING, required: true },
    latestSummary: { ...NULLABLE_STRING, required: true },
    blockedReason: { ...NULLABLE_STRING, required: true },
    reviewRound: { type: 'integer', required: true },
    revision: { type: 'integer', required: true },
    createdAt: { type: 'string', required: true },
    updatedAt: { type: 'string', required: true },
    completedAt: { ...NULLABLE_STRING, required: true },
    archivedAt: { ...NULLABLE_STRING, required: true },
  },
} as const

const CREATE_PARAMETERS = {
  title: { type: 'string', required: true, description: 'Short task title.' },
  notes: { ...NULLABLE_STRING, description: 'Optional notes; null clears the value.' },
  assignee: { ...NULLABLE_STRING, description: 'Optional person responsible for the todo.' },
  priority: { type: 'string', enum: [...TODO_PRIORITIES], description: 'Task priority; defaults to none.' },
  dueAt: { ...NULLABLE_STRING, description: 'Optional RFC 3339 deadline.' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Up to 20 tags.' },
} as const

function primarySessionId(exec: { readonly agent?: { readonly id: string } }): string {
  if (exec.agent === undefined) throw new Error('personal todo lifecycle tools require an Agent Session')
  return exec.agent.id
}

/** 注册个人待办的增删改查及 Agent 专属生命周期工具。 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'personal_todo_add',
    description: 'Create a durable personal todo shared across DSH sessions and projects.',
    parameters: CREATE_PARAMETERS,
    output: {
      schema: TODO_SCHEMA,
      render: (_args, todo) => [{ type: 'text', text: JSON.stringify(todo) }],
    },
    execute: (args, exec) => ctx.personalTodo.create(args, exec.signal),
    presentCall: args => ({ card: 'generic', title: `Create todo: ${args.title}`, kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'personal_todo_list',
    description: 'List durable personal todos. By default returns every active workflow state and excludes archived history.',
    parameters: {
      statuses: {
        type: 'array',
        items: { type: 'string', enum: [...TODO_STATUSES] },
        description: 'Lifecycle states to include.',
      },
      priorities: {
        type: 'array',
        items: { type: 'string', enum: [...TODO_PRIORITIES] },
        description: 'Priorities to include.',
      },
      tags: { type: 'array', items: { type: 'string' }, description: 'Every supplied tag must match.' },
      dueBefore: { type: 'string', description: 'Include tasks due at or before this RFC 3339 timestamp.' },
      search: { type: 'string', description: 'Case-insensitive title, notes, and assignee search.' },
      limit: { type: 'integer', description: 'Page size; deployment maximum defaults to 200.' },
      offset: { type: 'integer', description: 'Zero-based row offset.' },
      archived: { type: 'boolean', description: 'When true, return archived todos instead of normal history.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          todos: { type: 'array', items: TODO_SCHEMA, required: true },
          total: { type: 'integer', required: true },
          counts: {
            type: 'object',
            additionalProperties: false,
            required: true,
            properties: {
              pending: { type: 'integer', required: true },
              inProgress: { type: 'integer', required: true },
              blocked: { type: 'integer', required: true },
              inReview: { type: 'integer', required: true },
              completed: { type: 'integer', required: true },
              cancelled: { type: 'integer', required: true },
              archived: { type: 'integer', required: true },
            },
          },
          hasMore: { type: 'boolean', required: true },
        },
      },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    execute: (args, exec) => ctx.personalTodo.list(args, exec.signal),
    presentCall: args => ({ card: 'generic', title: 'List personal todos', kind: 'search', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'personal_todo_update',
    description: 'Edit an existing personal todo by id. Lifecycle transitions use dedicated task commands.',
    parameters: {
      id: { type: 'string', required: true, description: 'Todo id returned by add or list.' },
      title: { type: 'string', description: 'Replacement title.' },
      notes: { ...NULLABLE_STRING, description: 'Replacement notes, or null to clear.' },
      assignee: { ...NULLABLE_STRING, description: 'Replacement assignee, or null to clear.' },
      priority: { type: 'string', enum: [...TODO_PRIORITIES], description: 'Replacement priority.' },
      dueAt: { ...NULLABLE_STRING, description: 'Replacement RFC 3339 deadline, or null to clear.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Complete replacement tag set; [] clears tags.' },
    },
    output: {
      schema: TODO_SCHEMA,
      render: (_args, todo) => [{ type: 'text', text: JSON.stringify(todo) }],
    },
    execute: (args, exec) => {
      const { id, ...patch } = args
      return ctx.personalTodo.update({ id, patch }, exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `Update todo ${args.id}`, kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'personal_todo_progress',
    description: 'Record a concise, meaningful progress milestone for a personal todo owned by the current Agent Session.',
    parameters: {
      id: { type: 'string', required: true, description: 'Todo id supplied in the task prompt.' },
      message: { type: 'string', required: true, description: 'Concise milestone or current work phase.' },
    },
    output: {
      schema: TODO_SCHEMA,
      render: (_args, todo) => [{ type: 'text', text: JSON.stringify(todo) }],
    },
    execute: (args, exec) => ctx.personalTodo.reportProgress(args, primarySessionId(exec)),
    presentCall: args => ({ card: 'generic', title: `Update todo progress: ${args.id}`, kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'personal_todo_block',
    description: 'Pause the current personal todo and surface one exact question to the user.',
    parameters: {
      id: { type: 'string', required: true, description: 'Todo id supplied in the task prompt.' },
      question: { type: 'string', required: true, description: 'The exact question the user must answer.' },
    },
    output: {
      schema: TODO_SCHEMA,
      render: (_args, todo) => [{ type: 'text', text: JSON.stringify(todo) }],
    },
    execute: async (args, exec) => {
      const todo = await ctx.personalTodo.block(args, primarySessionId(exec))
      exec.concludeTurn()
      return todo
    },
    presentCall: args => ({ card: 'generic', title: `Block todo for input: ${args.id}`, kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'personal_todo_submit_review',
    description: 'Submit the current personal todo for user review. This never marks the todo completed.',
    parameters: {
      id: { type: 'string', required: true, description: 'Todo id supplied in the task prompt.' },
      summary: { type: 'string', required: true, description: 'Concise description of the completed outcome.' },
      verification: { ...NULLABLE_STRING, description: 'Checks performed and their results.' },
      risk: { ...NULLABLE_STRING, description: 'Remaining risks or limitations, or null when none are known.' },
    },
    output: {
      schema: TODO_SCHEMA,
      render: (_args, todo) => [{ type: 'text', text: JSON.stringify(todo) }],
    },
    execute: async (args, exec) => {
      const todo = await ctx.personalTodo.submitReview(args, primarySessionId(exec))
      exec.concludeTurn()
      return todo
    },
    presentCall: args => ({ card: 'generic', title: `Submit todo for review: ${args.id}`, kind: 'other', rawInput: args }),
  }))

  ctx.tools.register(defineTool({
    name: 'personal_todo_delete',
    description: 'Permanently delete one personal todo by id. Archived todos may be deleted regardless of lifecycle state.',
    parameters: {
      id: { type: 'string', required: true, description: 'Todo id returned by add or list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          deleted: { type: 'boolean', const: true, required: true },
        },
      },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    execute: (args, exec) => ctx.personalTodo.delete(args, exec.signal),
    presentCall: args => ({ card: 'generic', title: `Delete todo ${args.id}`, kind: 'other', rawInput: args }),
  }))
}
