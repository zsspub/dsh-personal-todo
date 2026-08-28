/** Four model-facing tools over the authoritative personal todo service. */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { TODO_PRIORITIES, TODO_STATUSES } from "./types.js";
export const name = 'personal-todo-tools';
export const inject = ['tools', 'personalTodo'];
const NULLABLE_STRING = { oneOf: [{ type: 'string' }, { type: 'null' }] };
const TODO_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        id: { type: 'string', required: true },
        title: { type: 'string', required: true },
        notes: { ...NULLABLE_STRING, required: true },
        status: { type: 'string', enum: [...TODO_STATUSES], required: true },
        priority: { type: 'string', enum: [...TODO_PRIORITIES], required: true },
        dueAt: { ...NULLABLE_STRING, required: true },
        tags: { type: 'array', items: { type: 'string' }, required: true },
        createdAt: { type: 'string', required: true },
        updatedAt: { type: 'string', required: true },
        completedAt: { ...NULLABLE_STRING, required: true },
    },
};
const CREATE_PARAMETERS = {
    title: { type: 'string', required: true, description: 'Short task title.' },
    notes: { ...NULLABLE_STRING, description: 'Optional notes; null clears the value.' },
    status: { type: 'string', enum: [...TODO_STATUSES], description: 'Initial lifecycle state; defaults to pending.' },
    priority: { type: 'string', enum: [...TODO_PRIORITIES], description: 'Task priority; defaults to none.' },
    dueAt: { ...NULLABLE_STRING, description: 'Optional RFC 3339 deadline.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Up to 20 tags.' },
};
/** Register personal_todo_add/list/update/delete on the shared tool registry. */
export function apply(ctx) {
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
    }));
    ctx.tools.register(defineTool({
        name: 'personal_todo_list',
        description: 'List durable personal todos. By default returns pending and in-progress tasks; pass statuses to include completed history.',
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
            search: { type: 'string', description: 'Case-insensitive title and notes search.' },
            limit: { type: 'integer', description: 'Page size; deployment maximum defaults to 200.' },
            offset: { type: 'integer', description: 'Zero-based row offset.' },
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
                            completed: { type: 'integer', required: true },
                        },
                    },
                    hasMore: { type: 'boolean', required: true },
                },
            },
            render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
        },
        execute: (args, exec) => ctx.personalTodo.list(args, exec.signal),
        presentCall: args => ({ card: 'generic', title: 'List personal todos', kind: 'search', rawInput: args }),
    }));
    ctx.tools.register(defineTool({
        name: 'personal_todo_update',
        description: 'Update an existing personal todo by id. Supply at least one field; null clears notes or dueAt, and tags replace the complete tag set.',
        parameters: {
            id: { type: 'string', required: true, description: 'Todo id returned by add or list.' },
            title: { type: 'string', description: 'Replacement title.' },
            notes: { ...NULLABLE_STRING, description: 'Replacement notes, or null to clear.' },
            status: { type: 'string', enum: [...TODO_STATUSES], description: 'Replacement lifecycle state.' },
            priority: { type: 'string', enum: [...TODO_PRIORITIES], description: 'Replacement priority.' },
            dueAt: { ...NULLABLE_STRING, description: 'Replacement RFC 3339 deadline, or null to clear.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Complete replacement tag set; [] clears tags.' },
        },
        output: {
            schema: TODO_SCHEMA,
            render: (_args, todo) => [{ type: 'text', text: JSON.stringify(todo) }],
        },
        execute: (args, exec) => {
            const { id, ...patch } = args;
            return ctx.personalTodo.update({ id, patch }, exec.signal);
        },
        presentCall: args => ({ card: 'generic', title: `Update todo ${args.id}`, kind: 'other', rawInput: args }),
    }));
    ctx.tools.register(defineTool({
        name: 'personal_todo_delete',
        description: 'Permanently delete one personal todo by id. Completed tasks otherwise remain available as history.',
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
    }));
}
//# sourceMappingURL=tools.js.map
