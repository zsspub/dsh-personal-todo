/** Todo-to-Session orchestration over the Host's ordinary Session service. */
import type { ReplyTodoRequest, RequestTodoChangesRequest, Todo } from '../types.ts';
import { TodoStore } from './store.ts';
interface TodoAgent {
    readonly id: string;
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
/** Minimum Host Session API consumed by the standalone plugin. */
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
/** Starts and resumes the one ordinary root Session owned by each todo. */
export declare class TodoOrchestrator {
    private readonly store;
    private readonly sessions;
    private readonly config;
    constructor(store: TodoStore, sessions: TodoSessionController, config: TodoOrchestratorConfig);
    private deliver;
    /** Create or resume a root Session and dispatch one pending todo. */
    start(id: string): Promise<Todo>;
    /** Deliver a user's answer to the blocked root Session. */
    reply(request: ReplyTodoRequest): Promise<Todo>;
    /** Start a new run in the same root Session with the user's review feedback. */
    requestChanges(request: RequestTodoChangesRequest): Promise<Todo>;
}
export {};
