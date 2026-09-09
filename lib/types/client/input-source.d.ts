import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type { ListTodoInput, TodoDetail, TodoListResult } from '../types.ts';
import type { PersonalTodoKey } from './locales.ts';
export declare const TODO_SOURCE = "personal-todo";
interface TodoInputApi {
    list(input: ListTodoInput, signal: AbortSignal): Promise<TodoListResult>;
    get(id: string, signal: AbortSignal): Promise<TodoDetail>;
}
/** Status folders drill into live Host todos; references resolve again when sent. */
export declare function createTodoInputSource(api: TodoInputApi, t: (key: PersonalTodoKey) => string): InputTriggerSource;
export {};
