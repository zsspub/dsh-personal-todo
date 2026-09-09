/** 侧栏入口与待办面板共用的打开状态和待处理提醒数量。 */
/** 供两个独立插槽入口共用的轻量可订阅状态控制器。 */
export class PersonalTodoCanvasController {
    #listeners = new Set();
    #snapshot = { open: false, attentionCount: 0 };
    getSnapshot = () => this.#snapshot;
    subscribe = (listener) => {
        this.#listeners.add(listener);
        return () => { this.#listeners.delete(listener); };
    };
    setAttentionCount(attentionCount) {
        this.#set({ ...this.#snapshot, attentionCount });
    }
    open() {
        this.#set({ ...this.#snapshot, open: true });
    }
    close() {
        this.#set({ ...this.#snapshot, open: false });
    }
    #set(snapshot) {
        if (snapshot.open === this.#snapshot.open
            && snapshot.attentionCount === this.#snapshot.attentionCount)
            return;
        this.#snapshot = snapshot;
        for (const listener of [...this.#listeners])
            listener();
    }
}
//# sourceMappingURL=canvas.js.map
