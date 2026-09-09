/** 面向模型的待办创建、查询、编辑、进度、阻塞和审核工具。 */
import type { Context } from '@deepseek-ai/cordis';
export declare const name = "personal-todo-tools";
export declare const inject: string[];
/** 注册个人待办的增删改查及 Agent 专属生命周期工具。 */
export declare function apply(ctx: Context): void;
