/** 侧栏入口、待办面板与对话卡片共用的导航状态。 */
import { atom } from 'nanostores';
/** 供多个独立插槽入口共用的 Nanostores 状态控制器。 */
export class PersonalTodoCanvasController {
    #store = atom({
        open: false,
        attentionCount: 0,
        targetTodoId: undefined,
        targetSessionId: undefined,
        targetTabId: undefined,
        navigationRevision: 0,
    });
    getSnapshot = () => this.#store.get();
    subscribe = (listener) => {
        return this.#store.listen(listener);
    };
    setAttentionCount(attentionCount) {
        this.#set({ ...this.#store.get(), attentionCount });
    }
    open() {
        this.#set({ ...this.#store.get(), open: true });
    }
    focusTodo(targetTodoId, targetSessionId, targetTabId) {
        const snapshot = this.#store.get();
        this.#set({
            ...snapshot,
            open: true,
            targetTodoId,
            targetSessionId,
            targetTabId,
            navigationRevision: snapshot.navigationRevision + 1,
        });
    }
    close() {
        this.#set({ ...this.#store.get(), open: false });
    }
    #set(snapshot) {
        const current = this.#store.get();
        if (snapshot.open === current.open
            && snapshot.attentionCount === current.attentionCount
            && snapshot.targetTodoId === current.targetTodoId
            && snapshot.targetSessionId === current.targetSessionId
            && snapshot.targetTabId === current.targetTabId
            && snapshot.navigationRevision === current.navigationRevision)
            return;
        this.#store.set(snapshot);
    }
}
//# sourceMappingURL=canvas.js.map
