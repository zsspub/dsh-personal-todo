/** Model-facing creation, query, editing, progress, blocking, and review tools. */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "personal-todo-tools";
export declare const inject: string[];
/** Register the personal todo CRUD and Agent-owned lifecycle tools. */
export declare function apply(ctx: Context): void;
