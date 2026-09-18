import React from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { CreateTodoInput, DeleteTodoResult, ListTodoInput, Todo, TodoDetail, TodoListResult, UpdateTodoRequest } from '../types.ts';
import type { ExportTodoDataResult, ImportTodoDataRequest, ImportTodoDataResult, SetTodoStatusRequest } from '../types.ts';
import type { PersonalTodoDataCenter } from './data-center.ts';
import type { PersonalTodoCanvasController } from './canvas.ts';
import type { NS } from './locales.ts';
export interface PersonalTodoPanelInjected {
    readonly dataCenter?: PersonalTodoDataCenter;
    readonly canvas: PersonalTodoCanvasController;
    readonly openCanvas: () => void;
    readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>;
    readonly exportData: (signal: AbortSignal) => Promise<ExportTodoDataResult>;
    readonly importData: (request: ImportTodoDataRequest, signal: AbortSignal) => Promise<ImportTodoDataResult>;
    readonly get: (id: string, signal: AbortSignal) => Promise<TodoDetail>;
    readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>;
    readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>;
    readonly start: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly approve: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly setStatus: (request: SetTodoStatusRequest, signal: AbortSignal) => Promise<Todo>;
    readonly stop: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly archive: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly restore: (id: string, signal: AbortSignal) => Promise<Todo>;
    readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>;
    readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>;
}
export type PersonalTodoTriggerProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected;
export type PersonalTodoCanvasProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected;
/** 打开待办面板并提示待处理事项的侧栏入口。 */
export declare function PersonalTodoTrigger({ wide, t, list, dataCenter, canvas, openCanvas, useSessions }: PersonalTodoTriggerProps): React.JSX.Element;
/** 渲染在宿主右侧 Sidebar Tab 中的个人待办面板。 */
export declare function PersonalTodoCanvas(props: PersonalTodoCanvasProps): React.JSX.Element;
