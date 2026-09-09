/** 内置 personal-todo-execution skill 的提供器。 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis 插件名称。 */
export declare const name = "personal-todo-execution-skill";
/** 内置 skill 提供器依赖的服务。 */
export declare const inject: string[];
/** 向 ctx.skills 注册内置 personal-todo-execution skill 提供器。 */
export declare function apply(ctx: Context): void;
