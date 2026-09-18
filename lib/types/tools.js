/** 面向模型的待办管理工具；不参与 Agent 对话执行流程。 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { personalTodoPresentationMeta } from "./presentation.js";
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
        assignee: { ...NULLABLE_STRING, required: true },
        status: { type: 'string', enum: [...TODO_STATUSES], required: true },
        executionStatus: { oneOf: [{ type: 'string', enum: ['running', 'idle', 'failed', 'stopped', 'unavailable'] }, { type: 'null' }], required: true },
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
};
const CREATE_PARAMETERS = {
    title: { type: 'string', required: true, description: 'Short task title.' },
    notes: { ...NULLABLE_STRING, description: 'Optional notes; null clears the value.' },
    assignee: { ...NULLABLE_STRING, description: 'Optional person responsible for the todo.' },
    priority: { type: 'string', enum: [...TODO_PRIORITIES], description: '待办优先级；用户未声明时使用 medium（中优先级）。' },
    dueAt: { ...NULLABLE_STRING, description: 'Optional RFC 3339 deadline.' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Up to 20 tags.' },
};
const LIST_PARAMETERS = {
    statuses: {
        type: 'array',
        items: { type: 'string', enum: [...TODO_STATUSES] },
        description: '任务进度：pending 待办、in_progress 进行中、completed 已完成、cancelled 已取消。',
    },
    priorities: {
        type: 'array',
        items: { type: 'string', enum: [...TODO_PRIORITIES] },
        description: '要包含的优先级。',
    },
    tags: { type: 'array', items: { type: 'string' }, description: '必须同时匹配的全部标签。' },
    dueBefore: { type: 'string', description: '只显示截止时间不晚于此 RFC 3339 时间的待办。' },
    search: { type: 'string', description: '不区分大小写搜索标题、备注和负责人。' },
    limit: { type: 'integer', description: '分页大小；部署最大值默认为 200。' },
    offset: { type: 'integer', description: '从零开始的分页偏移。' },
    archived: { type: 'boolean', description: '为 true 时只显示归档待办。' },
};
const LIST_OUTPUT_SCHEMA = {
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
                cancelled: { type: 'integer', required: true },
                archived: { type: 'integer', required: true },
            },
        },
        hasMore: { type: 'boolean', required: true },
    },
};
/** 注册用户按需调用的待办管理与备份工具。 */
export function apply(ctx) {
    ctx.tools.register(defineTool({
        name: 'personal_todo_add',
        description: '创建跨 DSH 会话和项目共享的持久待办，默认只保存，不启动 Agent。',
        parameters: CREATE_PARAMETERS,
        output: {
            schema: TODO_SCHEMA,
            render: (_args, todo) => [{ type: 'text', text: JSON.stringify(todo) }],
        },
        execute: (args, exec) => ctx.personalTodo.create({ ...args, priority: args.priority ?? 'medium' }, exec.signal),
        presentCall: args => ({ card: 'generic', title: `Create todo: ${args.title}`, kind: 'other', rawInput: args }),
    }));
    ctx.tools.register(defineTool({
        name: 'personal_todo_show',
        description: '在 DSH 对话中向用户展示可交互的个人待办卡片。用户只是查看、看看、列出或浏览待办时必须优先使用此工具；不要改用 personal_todo_list，也不要把结果逐项复述成 Markdown 表格。工具返回后只补充一句简短摘要。',
        parameters: LIST_PARAMETERS,
        output: {
            schema: LIST_OUTPUT_SCHEMA,
            render: (_args, result) => [{
                    type: 'text',
                    text: `已在对话卡片中展示 ${String(result.total)} 项待办。请只补充一句简短摘要，不要逐项复述，也不要生成 Markdown 表格。`,
                }],
            presentationMeta: (args, result) => personalTodoPresentationMeta(args, result),
        },
        execute: (args, exec) => ctx.personalTodo.list(args, exec.signal),
        presentCall: args => ({ card: 'generic', title: '展示个人待办', kind: 'search', rawInput: args }),
    }));
    ctx.tools.register(defineTool({
        name: 'personal_todo_list',
        description: '查询持久待办的完整 JSON，供 Agent 后续编辑、删除或其他数据处理使用。纯展示请求必须改用 personal_todo_show。默认返回待办和进行中任务，不含归档；status 由用户管理，executionStatus 来自宿主会话运行状态，不代表任务完成。',
        parameters: LIST_PARAMETERS,
        output: {
            schema: LIST_OUTPUT_SCHEMA,
            render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
            presentationMeta: (args, result) => personalTodoPresentationMeta(args, result),
        },
        execute: (args, exec) => ctx.personalTodo.list(args, exec.signal),
        presentCall: args => ({ card: 'generic', title: 'List personal todos', kind: 'search', rawInput: args }),
    }));
    ctx.tools.register(defineTool({
        name: 'personal_todo_update',
        description: '按 id 编辑待办元信息；不能修改任务进度、启动执行或代替用户确认完成。',
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
            const { id, ...patch } = args;
            return ctx.personalTodo.update({ id, patch }, exec.signal);
        },
        presentCall: args => ({ card: 'generic', title: `Update todo ${args.id}`, kind: 'other', rawInput: args }),
    }));
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
    }));
    ctx.tools.register(defineTool({
        name: 'personal_todo_export',
        description: '完整导出全部待办及历史为 JSON，不包含会话正文、附件或配置。需要保存文件时请使用宿主文件工具。',
        parameters: {},
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    filename: { type: 'string', required: true },
                    json: { type: 'string', required: true },
                },
            },
            render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
        },
        execute: (_args, exec) => ctx.personalTodo.exportData({}, exec.signal),
        presentCall: args => ({ card: 'generic', title: '导出个人待办备份', kind: 'other', rawInput: args }),
    }));
    ctx.tools.register(defineTool({
        name: 'personal_todo_import',
        description: '导入版本 1 或 2 的个人待办 JSON 备份，跳过已有待办 ID；正在运行 Agent 的新增任务转为待办，人工进行中任务保留进度，不派发 Agent。会话关联不是会话备份。仅在用户要求导入时调用，需要读取文件时请使用宿主文件工具。最多 20 MiB。',
        parameters: {
            json: { type: 'string', required: true, description: '完整的 dsh-personal-todo JSON 备份内容，不是文件路径。' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    imported: { type: 'integer', required: true },
                    skipped: { type: 'integer', required: true },
                    resetToPending: { type: 'integer', required: true },
                },
            },
            render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
        },
        execute: (args, exec) => ctx.personalTodo.importData(args, exec.signal),
        presentCall: () => ({ card: 'generic', title: '导入个人待办备份', kind: 'other' }),
    }));
}
//# sourceMappingURL=tools.js.map
