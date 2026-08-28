import React from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CreateTodoInput, DeleteTodoResult, ListTodoInput, Todo, TodoListResult, UpdateTodoRequest } from '../types.ts';
import type { NS } from './locales.ts';
export interface PersonalTodoPanelInjected {
    readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>;
    readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>;
    readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>;
    readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>;
}
export type PersonalTodoPanelProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected;
/** Sidebar action and modal manager for the shared personal todo database. */
export declare function PersonalTodoPanel({ wide, t, list, create, update, delete: deleteTodo }: PersonalTodoPanelProps): React.JSX.Element;
