/** Model-facing creation, query, editing, progress, blocking, and review tools. */
import type { Context } from '@deepseek-ai/cordis';
import { type Todo } from './types.ts';
export declare const name = "personal-todo-tools";
export declare const inject: string[];
/** Render the only prompt allowed for a todo-owned Codex dispatch. */
export declare function codexDelegationPrompt(todo: Pick<Todo, 'title' | 'notes'>): string;
/** Register the personal todo CRUD and Agent-owned lifecycle tools. */
export declare function apply(ctx: Context): void;
