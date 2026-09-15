/** 面向模型的待办管理工具；不参与 Agent 对话执行流程。 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "personal-todo-tools";
export declare const inject: string[];
/** 注册用户按需调用的待办管理与备份工具。 */
export declare function apply(ctx: Context): void;
