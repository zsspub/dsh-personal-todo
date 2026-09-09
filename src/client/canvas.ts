/** 侧栏入口与待办面板共用的打开状态和待处理提醒数量。 */

export interface PersonalTodoCanvasSnapshot {
  readonly open: boolean
  readonly attentionCount: number
}

/** 供两个独立插槽入口共用的轻量可订阅状态控制器。 */
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
