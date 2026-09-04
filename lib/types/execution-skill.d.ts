/** Bundled `personal-todo-execution` skill provider. */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis plugin name. */
export declare const name = "personal-todo-execution-skill";
/** Service required by the bundled provider. */
export declare const inject: string[];
/** Register the bundled `personal-todo-execution` provider on `ctx.skills`. */
export declare function apply(ctx: Context): void;
