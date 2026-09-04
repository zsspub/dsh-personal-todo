/** Browser plugin adding a localized personal-todo manager to the sidebar footer. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type PersonalTodoKey } from './locales.ts';
export { PersonalTodoCanvas, PersonalTodoTrigger } from './PersonalTodoPanel.tsx';
export type { PersonalTodoCanvasProps, PersonalTodoPanelInjected, PersonalTodoTriggerProps, } from './PersonalTodoPanel.tsx';
export type { PersonalTodoKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Personal todo panel controls and status copy. */
        personalTodo: PersonalTodoKey;
    }
    interface SlotMap {
        /** Root-scoped layer used to project the todo Canvas over the opened details column. */
        'shell.overlay': {
            kind: 'list';
            scope: 'root';
        };
    }
}
export declare const inject: string[];
/** Mount the generated Remote namespace and register the sidebar trigger plus todo Canvas. */
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
