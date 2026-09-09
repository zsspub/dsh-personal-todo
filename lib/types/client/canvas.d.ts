/** 侧栏入口与待办面板共用的打开状态和待处理提醒数量。 */
export interface PersonalTodoCanvasSnapshot {
    readonly open: boolean;
    readonly attentionCount: number;
}
/** 供两个独立插槽入口共用的轻量可订阅状态控制器。 */
export declare class PersonalTodoCanvasController {
    #private;
    readonly getSnapshot: () => PersonalTodoCanvasSnapshot;
    readonly subscribe: (listener: () => void) => (() => void);
    setAttentionCount(attentionCount: number): void;
    open(): void;
    close(): void;
}
