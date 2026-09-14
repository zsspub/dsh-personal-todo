/** 向工具和 Web Remote 调用提供统一 SQLite 个人待办数据库的 Host 服务。 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import z from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { TodoOrchestrator } from "./host/orchestrator.js";
import { TodoStore } from "./host/store.js";
export { PERSONAL_TODO_SCHEMA_VERSION, PersonalTodoError, TodoStore } from "./host/store.js";
const DEFAULTS = {
    journalMode: 'wal',
    busyTimeoutMs: 5_000,
    defaultListLimit: 50,
    maxListLimit: 200,
};
function resolveConfig(config) {
    return {
        databasePath: config.databasePath,
        journalMode: config.journalMode ?? DEFAULTS.journalMode,
        busyTimeoutMs: config.busyTimeoutMs ?? DEFAULTS.busyTimeoutMs,
        defaultListLimit: config.defaultListLimit ?? DEFAULTS.defaultListLimit,
        maxListLimit: config.maxListLimit ?? DEFAULTS.maxListLimit,
        ...(config.agentPreset === undefined ? {} : { agentPreset: config.agentPreset }),
    };
}
/** 生成的 Remote 方法与 Agent 工具共用的权威待办服务。 */
let PersonalTodoService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _exportData_decorators;
    let _importData_decorators;
    let _create_decorators;
    let _get_decorators;
    let _update_decorators;
    let _start_decorators;
    let _reply_decorators;
    let _approve_decorators;
    let _setStatus_decorators;
    let _stop_decorators;
    let _archive_decorators;
    let _restore_decorators;
    let _requestChanges_decorators;
    let _delete_decorators;
    return class PersonalTodoService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote];
            _exportData_decorators = [Remote];
            _importData_decorators = [Remote];
            _create_decorators = [Remote];
            _get_decorators = [Remote];
            _update_decorators = [Remote];
            _start_decorators = [Remote];
            _reply_decorators = [Remote];
            _approve_decorators = [Remote];
            _setStatus_decorators = [Remote];
            _stop_decorators = [Remote];
            _archive_decorators = [Remote];
            _restore_decorators = [Remote];
            _requestChanges_decorators = [Remote];
            _delete_decorators = [Remote];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _exportData_decorators, { kind: "method", name: "exportData", static: false, private: false, access: { has: obj => "exportData" in obj, get: obj => obj.exportData }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _importData_decorators, { kind: "method", name: "importData", static: false, private: false, access: { has: obj => "importData" in obj, get: obj => obj.importData }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _start_decorators, { kind: "method", name: "start", static: false, private: false, access: { has: obj => "start" in obj, get: obj => obj.start }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _reply_decorators, { kind: "method", name: "reply", static: false, private: false, access: { has: obj => "reply" in obj, get: obj => obj.reply }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approve_decorators, { kind: "method", name: "approve", static: false, private: false, access: { has: obj => "approve" in obj, get: obj => obj.approve }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setStatus_decorators, { kind: "method", name: "setStatus", static: false, private: false, access: { has: obj => "setStatus" in obj, get: obj => obj.setStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _stop_decorators, { kind: "method", name: "stop", static: false, private: false, access: { has: obj => "stop" in obj, get: obj => obj.stop }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _archive_decorators, { kind: "method", name: "archive", static: false, private: false, access: { has: obj => "archive" in obj, get: obj => obj.archive }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _restore_decorators, { kind: "method", name: "restore", static: false, private: false, access: { has: obj => "restore" in obj, get: obj => obj.restore }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _requestChanges_decorators, { kind: "method", name: "requestChanges", static: false, private: false, access: { has: obj => "requestChanges" in obj, get: obj => obj.requestChanges }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _delete_decorators, { kind: "method", name: "delete", static: false, private: false, access: { has: obj => "delete" in obj, get: obj => obj.delete }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['sessionController', 'sessions', 'agents'];
        static Config = z.object({
            databasePath: z.string().required(),
            journalMode: z.union(['wal', 'delete', 'truncate', 'persist']).default(DEFAULTS.journalMode),
            busyTimeoutMs: z.number().step(1).min(1).default(DEFAULTS.busyTimeoutMs),
            defaultListLimit: z.number().step(1).min(1).default(DEFAULTS.defaultListLimit),
            maxListLimit: z.number().step(1).min(1).default(DEFAULTS.maxListLimit),
            agentPreset: z.string(),
        });
        store = __runInitializers(this, _instanceExtraInitializers);
        orchestrator;
        /** @param ctx - 发布 personalTodo Remote 命名空间的 Host 上下文。 @param config - 已校验的数据库配置。 */
        constructor(ctx, config) {
            super(ctx, 'personalTodo');
            const resolved = resolveConfig(config);
            this.store = new TodoStore(resolved);
            this.orchestrator = new TodoOrchestrator(this.store, ctx.sessionController, resolved, ctx.agents);
            ctx.on('session/created', (session) => {
                const parentSessionId = session.header.parentSession;
                if (parentSessionId !== undefined)
                    this.store.linkRelatedSession(parentSessionId, session.id);
            }, { global: true });
            ctx.effect(() => {
                const recovery = new AbortController();
                void this.orchestrator.recover(recovery.signal).catch((error) => {
                    if (!recovery.signal.aborted)
                        ctx.logger.warn(`personal-todo: recovery failed: ${String(error)}`);
                });
                return () => {
                    recovery.abort();
                    this.orchestrator.dispose();
                    this.store.close();
                };
            }, 'personal-todo: recover runs and close sqlite');
        }
        /** 查询一页待办；在开始同步 SQLite 操作前检查取消信号。 */
        list(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.list(request));
        }
        exportData(_request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.exportData());
        }
        importData(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.importData(request.json));
        }
        /** 创建并持久化一条待办。 */
        create(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.create(request));
        }
        /** 读取待办及其执行轮次、关联会话和活动记录。 */
        get(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.detail(request.id));
        }
        /** 更新已持久化的待办。 */
        update(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.update(request.id, request.patch));
        }
        /** 在待办的持久化根会话中启动一条待处理任务。 */
        start(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.start(request.id);
        }
        /** 使用用户回复继续执行被阻塞的待办。 */
        reply(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.reply(request);
        }
        /** 用户确认完成任务；先停止活动执行并保留历史。 */
        approve(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.setStatus(request.id, 'completed');
        }
        setStatus(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.setStatus(request.id, request.status);
        }
        stop(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.stop(request.id);
        }
        /** 归档待办，不改变其生命周期状态。 */
        archive(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.archive(request.id);
        }
        /** 将归档待办恢复到对应生命周期列表。 */
        restore(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.restore(request.id));
        }
        /** 将用户修改意见发回待办的根会话。 */
        requestChanges(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.requestChanges(request);
        }
        /** 记录待办主 Agent 会话汇报的进度节点。 */
        reportProgress(request, sessionId) {
            this.orchestrator.assertAvailable(request.id);
            return Promise.resolve(this.store.progress(request.id, sessionId, request.message));
        }
        /** 根据主 Agent 会话提出的问题暂停待办。 */
        block(request, sessionId) {
            this.orchestrator.assertAvailable(request.id);
            return Promise.resolve(this.store.block(request, sessionId));
        }
        /** 提交主 Agent 会话的执行结果，等待用户审核。 */
        submitReview(request, sessionId) {
            this.orchestrator.assertAvailable(request.id);
            return Promise.resolve(this.store.submitReview(request, sessionId));
        }
        /** 永久删除一条待办。 */
        delete(request, signal) {
            signal.throwIfAborted();
            this.orchestrator.assertAvailable(request.id);
            return Promise.resolve(this.store.delete(request.id));
        }
    };
})();
export { PersonalTodoService };
export default PersonalTodoService;
//# sourceMappingURL=index.js.map
