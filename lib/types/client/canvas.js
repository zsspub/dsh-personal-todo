/** Shared open state and attention count for the sidebar trigger and todo Canvas. */
/** Small observable controller shared by the two independent slot entries. */
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
