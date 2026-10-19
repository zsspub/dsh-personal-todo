/** 进程内待办变更通知：只告知“需要重新读取”，不携带数据。 */
import type { TodoChangeEvent } from '../types.ts';
/** 记录变更版本并唤醒订阅者；订阅者来不及读取时，连续变化合并为一项。 */
export declare class TodoChangeFeed {
    private version;
    private readonly wakers;
    private disposed;
    notify(): void;
    /** 首项为 ready；之后每次读取前有新版本时产出一项 changed，直到取消或释放。 */
    follow(signal: AbortSignal): AsyncGenerator<TodoChangeEvent, void, undefined>;
    /** 结束全部订阅；之后的变更不再通知。 */
    dispose(): void;
}
