/** 侧栏入口、待办面板与对话卡片共用的导航状态。 */
export interface PersonalTodoCanvasSnapshot {
    readonly open: boolean;
    readonly attentionCount: number;
    readonly targetTodoId: string | undefined;
    readonly targetSessionId: string | undefined;
    readonly targetTabId: string | undefined;
    readonly navigationRevision: number;
}
/** 供多个独立插槽入口共用的 Nanostores 状态控制器。 */
export declare class PersonalTodoCanvasController {
    #private;
    readonly getSnapshot: () => PersonalTodoCanvasSnapshot;
    readonly subscribe: (listener: () => void) => (() => void);
    setAttentionCount(attentionCount: number): void;
    open(): void;
    focusTodo(targetTodoId: string, targetSessionId?: string, targetTabId?: string): void;
    close(): void;
}
