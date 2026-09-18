/** 将展示工具的持久化结果投影到所属回合末尾。 */
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { type PersonalTodoPresentationMeta } from '../presentation.ts';
export interface PersonalTodoTurnResult {
    readonly callId: string;
    readonly seq: number;
    readonly meta: PersonalTodoPresentationMeta;
}
export interface PersonalTodoTurnData {
    readonly results: readonly PersonalTodoTurnResult[];
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
    interface ConversationTurnDataMap {
        /** 当前回合中需要在回答末尾展示的个人待办查询。 */
        'personal-todo': PersonalTodoTurnData;
    }
}
interface PersonalTodoTurnState extends PersonalTodoTurnData {
    readonly turn: number;
    readonly calls: ReadonlySet<string>;
}
/** 从 Session 日志聚合成功的 `personal_todo_show` 调用。 */
export declare const personalTodoTurnDefinition: ConversationNodeDefinition<PersonalTodoTurnState>;
/** 选择结束位置之前最后一次成功的待办展示请求。 */
export declare function selectPersonalTodoTail(owner: TurnTailOwnerProps): PersonalTodoTurnResult | null;
export {};
