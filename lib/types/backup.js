import { z } from 'zod';
import { TODO_EVENT_TYPES, TODO_PRIORITIES, TODO_RUN_STATUSES, TODO_STATUSES } from "./types.js";
export const TODO_BACKUP_MAX_BYTES = 20 * 1024 * 1024;
const identifier = z.string().min(1).refine(value => value.trim().length > 0);
const timestamp = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const optionalTimestamp = timestamp.nullable();
const optionalText = z.string().max(10_000).nullable();
const nonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const todoSchema = z.strictObject({
    id: identifier,
    title: z.string().min(1).max(200).refine(value => value.trim().length > 0),
    notes: optionalText,
    assignee: z.string().max(100).nullable(),
    status: z.enum([...TODO_STATUSES, 'blocked', 'in_review']),
    executionStatus: z.enum(['running', 'waiting_input', 'submitted', 'failed', 'stopped']).nullable().optional(),
    priority: z.enum(TODO_PRIORITIES),
    dueAt: optionalTimestamp,
    tags: z.array(z.string().min(1).max(32)).max(20).refine(tags => new Set(tags).size === tags.length && tags.every(tag => tag === tag.trim().toLocaleLowerCase())),
    primarySessionId: identifier.nullable(),
    activeRunId: identifier.nullable(),
    latestSummary: optionalText,
    blockedReason: optionalText,
    reviewRound: nonNegativeInteger,
    revision: nonNegativeInteger,
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: optionalTimestamp,
    archivedAt: optionalTimestamp,
});
const backupSchema = z.strictObject({
    format: z.literal('dsh-personal-todo'),
    version: z.union([z.literal(1), z.literal(2)]),
    exportedAt: timestamp,
    todos: z.array(z.strictObject({
        todo: todoSchema,
        runs: z.array(z.strictObject({
            id: identifier,
            todoId: identifier,
            sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
            status: z.enum(TODO_RUN_STATUSES),
            rootSessionId: identifier,
            resultSummary: optionalText,
            verification: optionalText,
            risk: optionalText,
            startedAt: timestamp,
            finishedAt: optionalTimestamp,
        })),
        sessions: z.array(z.strictObject({
            todoId: identifier,
            sessionId: identifier,
            role: z.enum(['primary', 'related']),
            parentSessionId: identifier.nullable(),
            createdAt: timestamp,
        })),
        events: z.array(z.strictObject({
            id: identifier,
            todoId: identifier,
            runId: identifier.nullable(),
            type: z.enum(TODO_EVENT_TYPES),
            message: optionalText,
            createdAt: timestamp,
        })),
    })),
});
export function assertBackupSize(json) {
    if (new TextEncoder().encode(json).byteLength > TODO_BACKUP_MAX_BYTES) {
        throw new Error('备份 JSON 超过 20 MiB 限制，请缩小数据量后重试。');
    }
}
function assertUnique(values, name) {
    const seen = new Set();
    for (const value of values) {
        if (seen.has(value))
            throw new Error(`备份包含重复的 ${name}：${String(value)}`);
        seen.add(value);
    }
}
export function parseTodoBackup(json) {
    assertBackupSize(json);
    let value;
    try {
        value = JSON.parse(json.replace(/^\uFEFF/u, ''));
    }
    catch {
        throw new Error('备份不是有效的 JSON 文件。');
    }
    const parsed = backupSchema.safeParse(value);
    if (!parsed.success) {
        const path = parsed.error.issues[0]?.path.join('.') ?? '';
        throw new Error(`备份格式或字段无效：${path}。仅支持 dsh-personal-todo 版本 1 或 2。`);
    }
    const backup = parsed.data;
    assertUnique(backup.todos.map(detail => detail.todo.id), 'Todo ID');
    assertUnique(backup.todos.flatMap(detail => detail.runs.map(run => run.id)), 'Run ID');
    assertUnique(backup.todos.flatMap(detail => detail.events.map(event => event.id)), 'Event ID');
    assertUnique(backup.todos.flatMap(detail => detail.sessions.map(session => session.sessionId)), 'Session ID');
    for (const { todo, runs, sessions, events } of backup.todos) {
        const invalid = () => { throw new Error(`待办 ${todo.id} 的记录归属、引用关系或执行状态无效。`); };
        const runMap = new Map(runs.map(run => [run.id, run]));
        const sessionMap = new Map(sessions.map(session => [session.sessionId, session]));
        assertUnique(runs.map(run => run.sequence), `${todo.id} Run sequence`);
        if ([...runs, ...sessions, ...events].some(record => record.todoId !== todo.id))
            invalid();
        if (events.some(event => event.runId !== null && !runMap.has(event.runId)))
            invalid();
        if (todo.primarySessionId !== null && sessionMap.get(todo.primarySessionId)?.role !== 'primary')
            invalid();
        if (sessions.some(session => session.role === 'primary'
            && (session.sessionId !== todo.primarySessionId || session.parentSessionId !== null)))
            invalid();
        if (sessions.some(session => session.role === 'related' && session.parentSessionId === null))
            invalid();
        const checkedSessions = new Set();
        for (const session of sessions) {
            let current = session.sessionId;
            const chain = new Set();
            while (current !== null && !checkedSessions.has(current)) {
                if (chain.has(current))
                    invalid();
                chain.add(current);
                const linked = sessionMap.get(current);
                if (linked === undefined)
                    return invalid();
                current = linked.parentSessionId;
            }
            for (const sessionId of chain)
                checkedSessions.add(sessionId);
        }
        if (runs.some(run => sessionMap.get(run.rootSessionId)?.role !== 'primary'))
            invalid();
        const active = todo.activeRunId === null ? undefined : runMap.get(todo.activeRunId);
        if (todo.activeRunId !== null && (active === undefined || active.rootSessionId !== todo.primarySessionId))
            invalid();
        if (backup.version === 1) {
            const expected = { in_progress: 'running', blocked: 'waiting_input', in_review: 'submitted' };
            if (todo.status === 'in_progress' || todo.status === 'blocked' || todo.status === 'in_review') {
                if (active?.status !== expected[todo.status])
                    invalid();
            }
            else if (active !== undefined)
                invalid();
        }
        else {
            if (todo.status === 'blocked' || todo.status === 'in_review')
                invalid();
            if (active !== undefined && (todo.status !== 'in_progress' || !['running', 'waiting_input', 'submitted'].includes(active.status)))
                invalid();
            const latest = [...runs].sort((first, second) => second.sequence - first.sequence)[0];
            const executionStatus = latest === undefined ? null : latest.status === 'cancelled' ? 'stopped' : latest.status;
            if (todo.executionStatus !== executionStatus)
                invalid();
            if (active !== undefined && active.id !== latest?.id)
                invalid();
        }
        if (runs.some(run => (run.status === 'running' || run.status === 'waiting_input')
            && (run.id !== todo.activeRunId || run.finishedAt !== null)))
            invalid();
        if (runs.some(run => ['submitted', 'failed', 'cancelled'].includes(run.status) && run.finishedAt === null))
            invalid();
        if (todo.status === 'in_progress' && todo.revision === Number.MAX_SAFE_INTEGER)
            invalid();
    }
    return {
        ...backup,
        version: 2,
        todos: backup.todos.map(detail => {
            const latest = [...detail.runs].sort((first, second) => second.sequence - first.sequence)[0];
            return {
                ...detail,
                todo: {
                    ...detail.todo,
                    status: detail.todo.status === 'blocked' || detail.todo.status === 'in_review' ? 'in_progress' : detail.todo.status,
                    executionStatus: latest === undefined ? null : latest.status === 'cancelled' ? 'stopped' : latest.status,
                },
            };
        }),
    };
}
//# sourceMappingURL=backup.js.map
