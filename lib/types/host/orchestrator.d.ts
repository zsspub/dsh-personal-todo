/** 仅在用户明确操作时启动或停止待办关联会话。 */
import type { Todo, TodoStatus } from '../types.ts';
import { TodoStore } from './store.ts';
import type { TodoRuntime } from './runtime.ts';
export interface TodoAgent {
    readonly id: string;
    readonly status: 'idle' | 'running';
    cancel(cause: {
        readonly kind: 'user';
    }): void;
    whenIdle(): Promise<void>;
    followup(message: {
        readonly id: string;
        readonly role: 'user';
        readonly content: readonly [{
            readonly type: 'text';
            readonly text: string;
        }];
        readonly source: {
            readonly kind: 'user';
        };
    }): void;
}
export interface TodoAgentRegistry {
    get(sessionId: string): TodoAgent | undefined;
}
/** 独立插件所需的最小 Host 会话接口。 */
export interface TodoSessionController {
    create(request: {
        readonly sessionId: string;
        readonly agentPreset?: string;
    }): Promise<{
        readonly sessionId: string;
    }>;
    resolveAgent(sessionId: string): Promise<{
        readonly agent: TodoAgent;
    } | {
        readonly error: {
            readonly message: string;
        };
    }>;
}
interface TodoOrchestratorConfig {
    readonly agentPreset?: string;
}
/** 显式操作与被动运行状态观察分离。 */
export declare class TodoOrchestrator {
    private readonly store;
    private readonly sessions;
    private readonly config;
    private readonly agents;
    private readonly runtime;
    private readonly changing;
    constructor(store: TodoStore, sessions: TodoSessionController, config: TodoOrchestratorConfig, agents: TodoAgentRegistry, runtime: TodoRuntime);
    assertAvailable(id: string): void;
    private exclusive;
    private stopAgents;
    setStatus(id: string, status: TodoStatus): Promise<Todo>;
    stop(id: string): Promise<Todo>;
    archive(id: string): Promise<Todo>;
    /** 创建或复用根会话，并派发一条待处理待办。 */
    start(id: string): Promise<Todo>;
    private startRun;
}
export {};
