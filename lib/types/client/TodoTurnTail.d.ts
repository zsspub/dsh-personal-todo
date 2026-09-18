/** 在回合结束位置渲染待办展示卡片。 */
import React from 'react';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { PersonalTodoDataCenter } from './data-center.ts';
import { NS } from './locales.ts';
export interface TodoTurnTailInjected {
    readonly dataCenter: PersonalTodoDataCenter;
    readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>;
}
export type TodoTurnTailProps = PropsRuntime<'conversation.chat.turnTail'> & PropsLocale<typeof NS> & TodoTurnTailInjected;
/** 将回合投影恢复为现有待办卡片所需的稳定展示模型。 */
export declare function TodoTurnTail({ dataCenter, openSession, t, ...owner }: TodoTurnTailProps): React.JSX.Element | null;
