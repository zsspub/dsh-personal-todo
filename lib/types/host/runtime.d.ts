import type { TodoLiveStatus } from '../types.ts';
import type { TodoAgentRegistry } from './orchestrator.ts';
export interface RuntimeEvent {
    readonly type: string;
    readonly data?: unknown;
}
export interface TodoSessionQuery {
    readSession(id: string): Promise<{
        readonly events: readonly RuntimeEvent[];
    }>;
}
export declare class TodoRuntime {
    private readonly agents;
    private readonly query;
    private readonly warn;
    private readonly watched;
    private readonly states;
    private readonly reads;
    private readonly retryAfter;
    private disposed;
    constructor(agents: TodoAgentRegistry, query: TodoSessionQuery, warn: (message: string) => void);
    watch(id: string): void;
    notify(id: string, status: TodoLiveStatus): void;
    agentStatus(id: string, status: 'running' | 'idle'): void;
    agentDisposed(id: string): void;
    event(id: string, event: RuntimeEvent): void;
    status(id: string): TodoLiveStatus;
    refresh(id: string): Promise<void>;
    dispose(): void;
}
