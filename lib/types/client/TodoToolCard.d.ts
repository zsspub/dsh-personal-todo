import React from 'react';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { PersonalTodoDataCenter } from './data-center.ts';
import { NS } from './locales.ts';
interface TodoToolCardInjected {
    readonly dataCenter: PersonalTodoDataCenter;
    readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>;
}
export type TodoToolCardProps = Pick<ToolCallViewProps, 'block'> & PropsLocale<typeof NS> & TodoToolCardInjected;
/** 渲染展示工具及历史列表工具的实时待办卡片。 */
export declare function TodoToolCard({ block, dataCenter, openSession, t, }: TodoToolCardProps): React.JSX.Element;
export {};
