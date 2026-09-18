/** 对话内待办卡片的持久化展示数据。 */
import type { ListTodoInput, TodoListResult } from './types.ts';
import type { JsonValue } from '@deepseek-ai/dsh-tools';
export declare const TODO_PRESENTATION_VERSION = 1;
export declare const TODO_PRESENTATION_SNAPSHOT_LIMIT = 50;
export interface PersonalTodoPresentationMeta {
    readonly kind: 'personal-todo-list';
    readonly version: typeof TODO_PRESENTATION_VERSION;
    readonly query: ListTodoInput;
    readonly snapshot: TodoListResult;
    readonly snapshotTruncated: boolean;
}
/** 去掉分页游标，得到历史卡片后续刷新使用的稳定筛选条件。 */
export declare function normalizePresentationQuery(input: ListTodoInput): ListTodoInput;
/** 创建可随 Session 日志持久化的有界卡片快照。 */
export declare function personalTodoPresentationMeta(input: ListTodoInput, result: TodoListResult): PersonalTodoPresentationMeta & JsonValue;
export declare function isPersonalTodoPresentationMeta(value: unknown): value is PersonalTodoPresentationMeta;
