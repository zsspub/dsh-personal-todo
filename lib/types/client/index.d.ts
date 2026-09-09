/** 在侧栏底部添加支持多语言的个人待办管理入口。 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type PersonalTodoKey } from './locales.ts';
export { PersonalTodoCanvas, PersonalTodoTrigger } from './PersonalTodoPanel.tsx';
export type { PersonalTodoCanvasProps, PersonalTodoPanelInjected, PersonalTodoTriggerProps, } from './PersonalTodoPanel.tsx';
export type { PersonalTodoKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** 个人待办面板的控件和状态文案。 */
        personalTodo: PersonalTodoKey;
    }
    interface SlotMap {
        /** 承载个人待办悬浮抽屉的根级图层。 */
        'shell.overlay': {
            kind: 'list';
            scope: 'root';
        };
    }
}
export declare const inject: string[];
/** 挂载生成的 Remote 命名空间，并注册侧栏入口和待办面板。 */
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
