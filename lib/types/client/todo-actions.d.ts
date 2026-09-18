/** 侧栏与对话卡片共用的单项待办动作规则。 */
import type { Todo } from '../types.ts';
export type TodoLifecycleAction = 'complete' | 'pending' | 'cancel' | 'archive' | 'stop';
export interface TodoActionState {
    readonly actionable: boolean;
    readonly archived: boolean;
    readonly running: boolean;
    readonly canStart: boolean;
    readonly canComplete: boolean;
    readonly canReopen: boolean;
    readonly canCancel: boolean;
    readonly canArchive: boolean;
    readonly canRestore: boolean;
    readonly canDelete: boolean;
    readonly canOpenConversation: boolean;
}
export declare function todoActionState(todo: Todo): TodoActionState;
export declare function requiresAgentStop(todo: Todo, action: TodoLifecycleAction): boolean;
