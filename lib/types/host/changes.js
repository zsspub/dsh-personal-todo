/** 进程内待办变更通知：只告知“需要重新读取”，不携带数据。 */
/** 记录变更版本并唤醒订阅者；订阅者来不及读取时，连续变化合并为一项。 */
export class TodoChangeFeed {
    version = 0;
    wakers = new Set();
    disposed = false;
    notify() {
        if (this.disposed)
            return;
        this.version++;
        for (const wake of [...this.wakers])
            wake();
    }
    /** 首项为 ready；之后每次读取前有新版本时产出一项 changed，直到取消或释放。 */
    async *follow(signal) {
        let resume;
        const wake = () => {
            const resolve = resume;
            resume = undefined;
            resolve?.();
        };
        this.wakers.add(wake);
        signal.addEventListener('abort', wake);
        try {
            let seen = this.version;
            yield { type: 'ready' };
            while (!signal.aborted && !this.disposed) {
                if (this.version === seen) {
                    await new Promise(resolve => { resume = resolve; });
                    continue;
                }
                seen = this.version;
                yield { type: 'changed' };
            }
        }
        finally {
            this.wakers.delete(wake);
            signal.removeEventListener('abort', wake);
        }
    }
    /** 结束全部订阅；之后的变更不再通知。 */
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        for (const wake of [...this.wakers])
            wake();
    }
}
//# sourceMappingURL=changes.js.map
