/** 基于 Host 普通会话服务编排待办的启动与恢复。 */
import type { ReplyTodoRequest, RequestTodoChangesRequest, Todo } from '../types.ts';
import { TodoStore } from './store.ts';
interface TodoAgent {
    readonly id: string;
    readonly status: 'idle' | 'running';
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
/** 启动和恢复每条待办所属的唯一普通根会话。 */
export declare class TodoOrchestrator {
    private readonly store;
    private readonly sessions;
    private readonly config;
    constructor(store: TodoStore, sessions: TodoSessionController, config: TodoOrchestratorConfig);
    private deliver;
    /** 恢复已持久化且 Agent 尚未运行的执行中待办。 */
    recover(signal: AbortSignal): Promise<void>;
    /** 创建或复用根会话，并派发一条待处理待办。 */
    start(id: string): Promise<Todo>;
    /** 将用户回复发送到被阻塞待办的根会话。 */
    reply(request: ReplyTodoRequest): Promise<Todo>;
    /** 携带用户审核意见，在同一根会话中开始新一轮执行。 */
    requestChanges(request: RequestTodoChangesRequest): Promise<Todo>;
}
export {};
