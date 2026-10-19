import { describe, expect, it, vi } from 'vitest'
import { TodoChangeFeed } from '../src/host/changes.ts'
import { followTodoChanges, todoChangeRetryDelay, type TodoChangeStream } from '../src/client/change-stream.ts'
import type { TodoChangeEvent } from '../src/types.ts'

async function next<T>(iterator: AsyncIterator<T>): Promise<IteratorResult<T>> {
  return iterator.next()
}

describe('Host 变更通知', () => {
  it('首项为 ready，连续变化合并为一项，取消后结束', async () => {
    const feed = new TodoChangeFeed()
    const lifetime = new AbortController()
    const iterator = feed.follow(lifetime.signal)[Symbol.asyncIterator]()
    expect(await next(iterator)).toEqual({ done: false, value: { type: 'ready' } })

    feed.notify()
    feed.notify()
    feed.notify()
    expect(await next(iterator)).toEqual({ done: false, value: { type: 'changed' } })

    const waiting = next(iterator)
    feed.notify()
    expect(await waiting).toEqual({ done: false, value: { type: 'changed' } })

    const ended = next(iterator)
    lifetime.abort()
    expect(await ended).toEqual({ done: true, value: undefined })
  })

  it('ready 之前的变化不重复通知，释放后结束全部订阅且不再通知', async () => {
    const feed = new TodoChangeFeed()
    feed.notify()
    const first = feed.follow(new AbortController().signal)[Symbol.asyncIterator]()
    const second = feed.follow(new AbortController().signal)[Symbol.asyncIterator]()
    expect((await next(first)).value).toEqual({ type: 'ready' })
    expect((await next(second)).value).toEqual({ type: 'ready' })
    const firstWaiting = next(first)
    const secondWaiting = next(second)
    feed.dispose()
    feed.notify()
    expect(await firstWaiting).toEqual({ done: true, value: undefined })
    expect(await secondWaiting).toEqual({ done: true, value: undefined })
  })
})

class FakeStream implements TodoChangeStream {
  readonly dispose = vi.fn(() => { this.finish() })
  readonly #items: TodoChangeEvent[] = []
  #wake: (() => void) | undefined
  #failure: unknown
  #done = false

  push(event: TodoChangeEvent): void {
    this.#items.push(event)
    this.#wake?.()
  }

  fail(error: unknown): void {
    this.#failure = error
    this.#wake?.()
  }

  finish(): void {
    this.#done = true
    this.#wake?.()
  }

  async *[Symbol.asyncIterator](): AsyncIterator<TodoChangeEvent> {
    while (true) {
      const item = this.#items.shift()
      if (item !== undefined) {
        yield item
        continue
      }
      if (this.#failure !== undefined) throw this.#failure
      if (this.#done) return
      await new Promise<void>(resolve => { this.#wake = resolve })
      this.#wake = undefined
    }
  }
}

describe('客户端变更订阅', () => {
  it('退避延迟按指数增长并封顶', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(todoChangeRetryDelay)).toEqual([500, 1_000, 2_000, 4_000, 8_000, 10_000, 10_000])
  })

  it('ready 与 changed 都触发刷新；流失败或结束后退避重连，重连成功重置退避', async () => {
    const streams: FakeStream[] = []
    const changed = vi.fn()
    const delays: number[] = []
    const wait = vi.fn(async (ms: number) => { delays.push(ms) })
    const stop = followTodoChanges({
      open: () => {
        const stream = new FakeStream()
        streams.push(stream)
        return stream
      },
      changed,
      wait,
    })
    await vi.waitFor(() => { expect(streams).toHaveLength(1) })
    streams[0]!.push({ type: 'ready' })
    streams[0]!.push({ type: 'changed' })
    await vi.waitFor(() => { expect(changed).toHaveBeenCalledTimes(2) })

    streams[0]!.fail(new Error('断线'))
    await vi.waitFor(() => { expect(streams).toHaveLength(2) })
    expect(streams[0]!.dispose).toHaveBeenCalled()
    streams[1]!.finish()
    await vi.waitFor(() => { expect(streams).toHaveLength(3) })
    expect(delays).toEqual([500, 1_000])

    streams[2]!.push({ type: 'ready' })
    await vi.waitFor(() => { expect(changed).toHaveBeenCalledTimes(3) })
    streams[2]!.finish()
    await vi.waitFor(() => { expect(streams).toHaveLength(4) })
    expect(delays).toEqual([500, 1_000, 500])
    stop()
    stop()
  })

  it('open 同步抛错也会重试；刷新回调失败不中断订阅；停止后关闭当前流且不再重连', async () => {
    const streams: FakeStream[] = []
    let failOpen = true
    const changed = vi.fn(() => { throw new Error('刷新失败') })
    const stop = followTodoChanges({
      open: () => {
        if (failOpen) {
          failOpen = false
          throw new Error('接口不可用')
        }
        const stream = new FakeStream()
        streams.push(stream)
        return stream
      },
      changed,
      retryDelay: () => 0,
    })
    await vi.waitFor(() => { expect(streams).toHaveLength(1) })
    streams[0]!.push({ type: 'ready' })
    streams[0]!.push({ type: 'changed' })
    await vi.waitFor(() => { expect(changed).toHaveBeenCalledTimes(2) })

    stop()
    expect(streams[0]!.dispose).toHaveBeenCalled()
    streams[0]!.push({ type: 'changed' })
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(streams).toHaveLength(1)
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('默认等待在停止时立即结束，不再打开新流', async () => {
    const open = vi.fn(() => {
      const stream = new FakeStream()
      stream.finish()
      return stream
    })
    const stop = followTodoChanges({ open, changed: vi.fn(), retryDelay: () => 60_000 })
    await vi.waitFor(() => { expect(open).toHaveBeenCalledOnce() })
    stop()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(open).toHaveBeenCalledOnce()
  })
})
