import React from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CreateTodoInput, DeleteTodoResult, ListTodoInput, ReplyTodoRequest, RequestTodoChangesRequest, Todo, TodoDetail, TodoListResult, UpdateTodoRequest } from '../types.ts';
import type { PersonalTodoCanvasController } from './canvas.ts';
import type { NS } from './locales.ts';
export interface PersonalTodoPanelInjected {
    readonly canvas: PersonalTodoCanvasController;
    readonly openCanvas: () => void;
    readonly closeCanvas: () => void;
    readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>;
    readonly get: (id: string, signal: AbortSignal) => Promise<TodoDetail>;
    readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>;
    readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>;
    readonly start: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly reply: (request: ReplyTodoRequest, signal: AbortSignal) => Promise<Todo>;
    readonly approve: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly archive: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly restore: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly requestChanges: (request: RequestTodoChangesRequest, signal: AbortSignal) => Promise<Todo>;
    readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>;
    readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>;
}
export type PersonalTodoTriggerProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected;
export type PersonalTodoCanvasProps = PropsRuntime<'shell.overlay'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected;
/** Sidebar action opening the task Canvas and surfacing attention work. */
export declare function PersonalTodoTrigger({ wide, t, list, canvas, openCanvas }: PersonalTodoTriggerProps): React.JSX.Element;
/** Task-driven personal todo Canvas rendered on the right side of the frame. */
export declare function PersonalTodoCanvas(props: PersonalTodoCanvasProps): React.JSX.Element | null;
