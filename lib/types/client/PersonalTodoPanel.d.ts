import React from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CreateTodoInput, DeleteTodoResult, ListTodoInput, ReplyTodoRequest, RequestTodoChangesRequest, Todo, TodoDetail, TodoListResult, UpdateTodoRequest } from '../types.ts';
import type { NS } from './locales.ts';
export interface PersonalTodoPanelInjected {
    readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>;
    readonly get: (id: string, signal: AbortSignal) => Promise<TodoDetail>;
    readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>;
    readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>;
    readonly start: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly reply: (request: ReplyTodoRequest, signal: AbortSignal) => Promise<Todo>;
    readonly approve: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly requestChanges: (request: RequestTodoChangesRequest, signal: AbortSignal) => Promise<Todo>;
    readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>;
    readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>;
}
export type PersonalTodoPanelProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected;
/** Sidebar action and task-driven personal todo center. */
export declare function PersonalTodoPanel(props: PersonalTodoPanelProps): React.JSX.Element;
