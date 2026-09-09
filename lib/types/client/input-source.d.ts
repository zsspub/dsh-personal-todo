import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { ListTodoInput, TodoDetail, TodoListResult } from '../types.ts';
import type { PersonalTodoKey } from './locales.ts';
export declare const TODO_SOURCE = "personal-todo";
interface TodoInputApi {
    list(input: ListTodoInput, signal: AbortSignal): Promise<TodoListResult>;
    get(id: string, signal: AbortSignal): Promise<TodoDetail>;
}
/** 通过状态文件夹逐级浏览 Host 中的实时待办；发送引用时重新读取记录。 */
export declare function createTodoInputSource(api: TodoInputApi, t: (key: PersonalTodoKey) => string): InputTriggerSource;
export {};
