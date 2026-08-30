/** Host service exposing one SQLite personal-todo database to tools and Web Remote calls. */
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
/** Authoritative todo service shared by generated Remote methods and Agent tools. */
let PersonalTodoService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _create_decorators;
    let _get_decorators;
    let _update_decorators;
    let _start_decorators;
    let _reply_decorators;
    let _approve_decorators;
    let _requestChanges_decorators;
    let _delete_decorators;
    return class PersonalTodoService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _list_decorators = [Remote];
            _create_decorators = [Remote];
            _get_decorators = [Remote];
            _update_decorators = [Remote];
            _start_decorators = [Remote];
            _reply_decorators = [Remote];
            _approve_decorators = [Remote];
            _requestChanges_decorators = [Remote];
            _delete_decorators = [Remote];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _start_decorators, { kind: "method", name: "start", static: false, private: false, access: { has: obj => "start" in obj, get: obj => obj.start }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _reply_decorators, { kind: "method", name: "reply", static: false, private: false, access: { has: obj => "reply" in obj, get: obj => obj.reply }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _approve_decorators, { kind: "method", name: "approve", static: false, private: false, access: { has: obj => "approve" in obj, get: obj => obj.approve }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _requestChanges_decorators, { kind: "method", name: "requestChanges", static: false, private: false, access: { has: obj => "requestChanges" in obj, get: obj => obj.requestChanges }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _delete_decorators, { kind: "method", name: "delete", static: false, private: false, access: { has: obj => "delete" in obj, get: obj => obj.delete }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['sessionController'];
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
        /** @param ctx - Host context publishing the `personalTodo` Remote namespace. @param config - validated database policy. */
        constructor(ctx, config) {
            super(ctx, 'personalTodo');
            const resolved = resolveConfig(config);
            this.store = new TodoStore(resolved);
            this.orchestrator = new TodoOrchestrator(this.store, ctx.sessionController, resolved);
            ctx.effect(() => () => { this.store.close(); }, 'personal-todo: close sqlite');
        }
        /** List one bounded page. Cancellation is checked before synchronous SQLite work begins. */
        list(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.list(request));
        }
        /** Create one durable todo. */
        create(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.create(request));
        }
        /** Read one todo with its runs, Sessions, and activity timeline. */
        get(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.detail(request.id));
        }
        /** Update one durable todo. */
        update(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.update(request.id, request.patch));
        }
        /** Start one pending todo in its durable root Session. */
        start(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.start(request.id);
        }
        /** Resume a blocked todo with the user's answer. */
        reply(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.reply(request);
        }
        /** Accept the latest Agent submission as complete. */
        approve(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.approve(request.id));
        }
        /** Return the reviewed todo to its root Session with user feedback. */
        requestChanges(request, signal) {
            signal.throwIfAborted();
            return this.orchestrator.requestChanges(request);
        }
        /** Record one progress milestone from the todo's primary Agent Session. */
        reportProgress(request, sessionId) {
            return Promise.resolve(this.store.progress(request.id, sessionId, request.message));
        }
        /** Pause one todo on a question from its primary Agent Session. */
        block(request, sessionId) {
            return Promise.resolve(this.store.block(request, sessionId));
        }
        /** Submit one primary Agent Session's result for user review. */
        submitReview(request, sessionId) {
            return Promise.resolve(this.store.submitReview(request, sessionId));
        }
        /** Permanently delete one todo. */
        delete(request, signal) {
            signal.throwIfAborted();
            return Promise.resolve(this.store.delete(request.id));
        }
    };
})();
export { PersonalTodoService };
export default PersonalTodoService;
//# sourceMappingURL=index.js.map
