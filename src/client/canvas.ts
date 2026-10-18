/** 侧栏入口、待办面板与对话卡片共用的导航状态。 */

import { atom } from 'nanostores'

export interface PersonalTodoCanvasSnapshot {
  readonly open: boolean
  readonly attentionCount: number
  readonly targetTodoId: string | undefined
  readonly targetSessionId: string | undefined
  readonly targetTabId: string | undefined
  readonly navigationRevision: number
}

/** 供多个独立插槽入口共用的 Nanostores 状态控制器。 */
export class PersonalTodoCanvasController {
  readonly #store = atom<PersonalTodoCanvasSnapshot>({
    open: false,
    attentionCount: 0,
    targetTodoId: undefined,
    targetSessionId: undefined,
    targetTabId: undefined,
    navigationRevision: 0,
  })

  readonly getSnapshot = (): PersonalTodoCanvasSnapshot => this.#store.get()

  readonly subscribe = (listener: () => void): (() => void) => {
    return this.#store.listen(listener)
  }

  setAttentionCount(attentionCount: number): void {
    this.#set({ ...this.#store.get(), attentionCount })
  }

  open(): void {
    this.#set({ ...this.#store.get(), open: true })
  }

  focusTodo(targetTodoId: string, targetSessionId?: string, targetTabId?: string): void {
    const snapshot = this.#store.get()
    this.#set({
      ...snapshot,
      open: true,
      targetTodoId,
      targetSessionId,
      targetTabId,
      navigationRevision: snapshot.navigationRevision + 1,
    })
  }

  close(): void {
    this.#set({ ...this.#store.get(), open: false })
  }

  #set(snapshot: PersonalTodoCanvasSnapshot): void {
    const current = this.#store.get()
    if (snapshot.open === current.open
      && snapshot.attentionCount === current.attentionCount
      && snapshot.targetTodoId === current.targetTodoId
      && snapshot.targetSessionId === current.targetSessionId
      && snapshot.targetTabId === current.targetTabId
      && snapshot.navigationRevision === current.navigationRevision) return
    this.#store.set(snapshot)
  }
}
