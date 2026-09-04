/** Shared open state and attention count for the sidebar trigger and todo Canvas. */

export interface PersonalTodoCanvasSnapshot {
  readonly open: boolean
  readonly attentionCount: number
}

/** Small observable controller shared by the two independent slot entries. */
export class PersonalTodoCanvasController {
  readonly #listeners = new Set<() => void>()
  #snapshot: PersonalTodoCanvasSnapshot = { open: false, attentionCount: 0 }

  readonly getSnapshot = (): PersonalTodoCanvasSnapshot => this.#snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  setAttentionCount(attentionCount: number): void {
    this.#set({ ...this.#snapshot, attentionCount })
  }

  open(): void {
    this.#set({ ...this.#snapshot, open: true })
  }

  close(): void {
    this.#set({ ...this.#snapshot, open: false })
  }

  #set(snapshot: PersonalTodoCanvasSnapshot): void {
    if (snapshot.open === this.#snapshot.open
      && snapshot.attentionCount === this.#snapshot.attentionCount) return
    this.#snapshot = snapshot
    for (const listener of [...this.#listeners]) listener()
  }
}
