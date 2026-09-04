/** Shared open state and attention count for the sidebar trigger and todo Canvas. */
export interface PersonalTodoCanvasSnapshot {
    readonly open: boolean;
    readonly attentionCount: number;
}
/** Small observable controller shared by the two independent slot entries. */
export declare class PersonalTodoCanvasController {
    #private;
    readonly getSnapshot: () => PersonalTodoCanvasSnapshot;
    readonly subscribe: (listener: () => void) => (() => void);
    setAttentionCount(attentionCount: number): void;
    open(): void;
    close(): void;
}
