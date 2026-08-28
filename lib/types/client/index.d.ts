/** Browser plugin adding a localized personal-todo manager to the sidebar footer. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import { type PersonalTodoKey } from './locales.ts';
export { PersonalTodoPanel } from './PersonalTodoPanel.tsx';
export type { PersonalTodoPanelInjected, PersonalTodoPanelProps } from './PersonalTodoPanel.tsx';
export type { PersonalTodoKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Personal todo panel controls and status copy. */
        personalTodo: PersonalTodoKey;
    }
}
export declare const inject: string[];
/** Mount the generated Remote namespace and register one additive sidebar action. */
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
