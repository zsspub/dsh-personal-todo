/** 通过公开宿主接口创建普通空会话，并等待其原生右侧区域可用。 */
import { atom } from 'nanostores';
const WAIT_MS = 10_000;
const NO_SURFACE = 'sidebarRight: no session surface is mounted';
/** 最近工作区的选择与宿主原生新会话规则一致，同值保持宿主列表顺序。 */
export function recentTodoWorkspace(workspaces, sessions) {
    let selected;
    let selectedTime = Number.NEGATIVE_INFINITY;
    for (const workspace of workspaces) {
        let latest = Number.NEGATIVE_INFINITY;
        for (const id of workspace.sessionIds) {
            const session = sessions[id];
            if (session !== undefined)
                latest = Math.max(latest, session.updatedAt);
        }
        if (latest === Number.NEGATIVE_INFINITY)
            latest = Date.parse(workspace.createdAt);
        if (selected === undefined || latest > selectedTime) {
            selected = workspace.workspaceId;
            selectedTime = latest;
        }
    }
    return selected;
}
/** 一个插件实例只拥有一个打开请求；重复点击共享创建，不发送消息或执行待办。 */
export class PersonalTodoPanelOpener {
    host;
    #state = atom({ opening: false, error: undefined });
    #pending;
    #request;
    #todoId;
    #disposed = false;
    constructor(host) {
        this.host = host;
    }
    getSnapshot = () => this.#state.get();
    subscribe = (listener) => this.#state.listen(listener);
    /** 打开失败通过订阅状态显示；并发调用只更新最后一次定位目标。 */
    open(todoId) {
        if (this.#disposed)
            return Promise.resolve();
        this.#todoId = todoId;
        if (this.#pending !== undefined)
            return this.#pending;
        const request = new AbortController();
        this.#request = request;
        this.#state.set({ opening: true, error: undefined });
        this.#pending = this.#run(request).catch((error) => {
            if (!request.signal.aborted)
                this.#state.set({ opening: false, error: error instanceof Error ? error.message : String(error) });
        }).finally(() => {
            this.#pending = undefined;
            this.#request = undefined;
            if (!this.#disposed)
                this.#state.set({ ...this.#state.get(), opening: false });
        });
        return this.#pending;
    }
    /** 保留失败请求的待办定位目标，使用当前会话重试。 */
    retry() { return this.open(this.#todoId); }
    /** 撤销后续导航、挂载等待和打开动作，不删除已创建的普通会话。 */
    dispose() {
        this.#disposed = true;
        this.#request?.abort();
    }
    async #run(request) {
        const { host } = this;
        const { signal } = request;
        let expected = host.current.getSnapshot();
        const unselect = host.current.subscribe(() => {
            if (host.current.getSnapshot() !== expected)
                request.abort();
        });
        let unnavigation = this.#watchNavigation(request);
        try {
            if (expected === undefined) {
                await this.#wait(signal, [host.workspaces.list, host.sessions.list], () => (host.workspaces.list.getSnapshot().phase === 'ready' && host.sessions.list.getSnapshot().phase === 'ready'));
                signal.throwIfAborted();
                const workspaceId = recentTodoWorkspace(host.workspaces.list.getSnapshot().items, host.sessions.list.getSnapshot().byId);
                if (workspaceId === undefined)
                    throw new Error(host.message('workspaceRequired'));
                const created = await host.sessions.create({ workspaceId });
                signal.throwIfAborted();
                expected = created;
            }
            signal.throwIfAborted();
            // 自己的导航也会终止旧导航信号；先解绑，再为挂载等待登记新的取消信号。
            unnavigation();
            host.reveal(expected);
            unnavigation = this.#watchNavigation(request);
            signal.throwIfAborted();
            const target = expected;
            await this.#wait(signal, [host.mounted], () => {
                if (host.current.getSnapshot() !== target) {
                    request.abort();
                    return false;
                }
                if (host.mounted.getSnapshot() !== target)
                    return false;
                try {
                    host.openTab();
                    return true;
                }
                catch (error) {
                    if (error instanceof Error && error.message === NO_SURFACE)
                        return false;
                    throw error;
                }
            }, true);
            signal.throwIfAborted();
            host.opened(target, this.#todoId);
        }
        finally {
            unnavigation();
            unselect();
        }
    }
    #watchNavigation(request) {
        const navigation = this.host.beginNavigation();
        const cancel = () => { request.abort(); };
        navigation.addEventListener('abort', cancel, { once: true });
        return () => { navigation.removeEventListener('abort', cancel); };
    }
    #wait(signal, sources, ready, afterRender = false) {
        return new Promise((resolve, reject) => {
            let frame;
            let settled = false;
            const cleanups = [];
            const finish = (error) => {
                if (settled)
                    return;
                settled = true;
                for (const cleanup of cleanups)
                    cleanup();
                if (frame !== undefined)
                    cancelAnimationFrame(frame);
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
                if (error === undefined)
                    resolve();
                else
                    reject(error);
            };
            const abort = () => { finish(signal.reason); };
            const check = () => {
                frame = undefined;
                if (signal.aborted) {
                    abort();
                    return;
                }
                try {
                    if (ready())
                        finish();
                    else if (afterRender)
                        schedule();
                }
                catch (error) {
                    finish(error);
                }
            };
            const schedule = () => {
                if (!settled && frame === undefined)
                    frame = requestAnimationFrame(check);
            };
            const timer = setTimeout(() => { finish(new Error(this.host.message('timeout'))); }, WAIT_MS);
            signal.addEventListener('abort', abort, { once: true });
            for (const source of sources)
                cleanups.push(source.subscribe(afterRender ? schedule : check));
            if (afterRender)
                schedule();
            else
                check();
        });
    }
}
//# sourceMappingURL=panel-opener.js.map
