/** Four model-facing tools over the authoritative personal todo service. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "personal-todo-tools";
export declare const inject: string[];
/** Register personal_todo_add/list/update/delete on the shared tool registry. */
export declare function apply(ctx: Context): void;
