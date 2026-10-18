/** 通过公开宿主接口创建普通空会话，并等待其原生右侧区域可用。 */
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types';
interface Source<T> {
    getSnapshot(): T;
    subscribe(listener: () => void): () => void;
}
export interface PanelOpenHost {
    readonly sessions: Pick<ISessions, 'list' | 'create'>;
    readonly workspaces: Pick<IWorkspaces, 'list'>;
    readonly current: Source<SessionId | undefined>;
    readonly mounted: Source<SessionId | undefined>;
    readonly beginNavigation: () => AbortSignal;
    readonly reveal: (id: SessionId) => void;
    readonly openTab: () => void;
    readonly opened: (id: SessionId, todoId: string | undefined) => void;
    readonly message: (reason: 'workspaceRequired' | 'timeout') => string;
}
export interface PanelOpenSnapshot {
    readonly opening: boolean;
    readonly error: string | undefined;
}
/** 最近工作区的选择与宿主原生新会话规则一致，同值保持宿主列表顺序。 */
export declare function recentTodoWorkspace(workspaces: ReturnType<IWorkspaces['list']['getSnapshot']>['items'], sessions: ReturnType<ISessions['list']['getSnapshot']>['byId']): WorkspaceId | undefined;
/** 一个插件实例只拥有一个打开请求；重复点击共享创建，不发送消息或执行待办。 */
export declare class PersonalTodoPanelOpener {
    #private;
    private readonly host;
    constructor(host: PanelOpenHost);
    readonly getSnapshot: () => PanelOpenSnapshot;
    readonly subscribe: (listener: () => void) => (() => void);
    /** 打开失败通过订阅状态显示；并发调用只更新最后一次定位目标。 */
    open(todoId?: string): Promise<void>;
    /** 保留失败请求的待办定位目标，使用当前会话重试。 */
    retry(): Promise<void>;
    /** 撤销后续导航、挂载等待和打开动作，不删除已创建的普通会话。 */
    dispose(): void;
}
export {};
