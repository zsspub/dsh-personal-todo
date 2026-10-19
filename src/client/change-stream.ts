/** 订阅 Host 待办变更通知，断开后退避重新订阅。 */

import type { TodoChangeEvent } from '../types.ts'

/** 生成的流式 Remote 句柄中本模块使用的部分。 */
export interface TodoChangeStream extends AsyncIterable<TodoChangeEvent> {
  dispose(): void
}

export interface FollowTodoChangesOptions {
  /** 打开一条新的变更流；lifetime 中止时流应结束。 */
  readonly open: (signal: AbortSignal) => TodoChangeStream
  /** 收到 ready 或 changed 时调用；两者都表示需要重新读取。 */
  readonly changed: (event: TodoChangeEvent) => void
  /** 第 attempt 次连续失败后的等待毫秒数。 */
  readonly retryDelay?: (attempt: number) => number
  readonly wait?: (ms: number, signal: AbortSignal) => Promise<void>
}

const RETRY_BASE_MS = 500
const RETRY_MAX_MS = 10_000

/** 指数退避，上限 10 秒；只在流断开后使用，不做定时刷新。 */
export function todoChangeRetryDelay(attempt: number): number {
  return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1))
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) {
      resolve()
      return
    }
    const done = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

/**
 * 持续订阅变更流。每次连接成功都会先收到 ready，用于补齐断开期间漏掉的变化；
 * 流异常或正常结束（Host 重载、插件更新）后按退避重新订阅。
 * @returns 停止订阅并关闭当前流的函数，可重复调用。
 */
export function followTodoChanges(options: FollowTodoChangesOptions): () => void {
  const lifetime = new AbortController()
  const delay = options.retryDelay ?? todoChangeRetryDelay
  const sleep = options.wait ?? wait
  let current: TodoChangeStream | undefined
  void (async () => {
    let attempt = 0
    while (!lifetime.signal.aborted) {
      let stream: TodoChangeStream | undefined
      try {
        stream = options.open(lifetime.signal)
        current = stream
        for await (const event of stream) {
          if (lifetime.signal.aborted) break
          if (event.type === 'ready') attempt = 0
          try {
            options.changed(event)
          } catch {
            // 刷新失败由数据中心自行展示，不能中断订阅。
          }
        }
      } catch {
        // 断线、Host 重载或接口暂不可用：退避后重新订阅。
      } finally {
        current = undefined
        stream?.dispose()
      }
      if (lifetime.signal.aborted) break
      attempt++
      await sleep(delay(attempt), lifetime.signal)
    }
  })()
  return () => {
    lifetime.abort()
    current?.dispose()
  }
}
