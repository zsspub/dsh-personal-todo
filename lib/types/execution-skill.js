/** 内置 personal-todo-execution skill 的提供器。 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BUNDLED_SKILL_RANK, } from '@deepseek-ai/dsh-skill';
const PROVIDER_NAME = 'personal-todo';
const SKILL_NAME = 'personal-todo-execution';
const SKILL_BODY_URL = new URL('../assets/personal-todo-execution.md', import.meta.url);
const RESOURCE_BASE = {
    kind: 'directory',
    path: fileURLToPath(new URL('../assets/', import.meta.url)),
};
const INVOCATION = { modelInvocable: true, userInvocable: false };
const DESCRIPTION = '执行 DSH 个人待办的轻量约定：在原对话中正常沟通，待办只展示任务进度和会话运行状态。';
const CANDIDATE = {
    name: SKILL_NAME,
    description: DESCRIPTION,
    invocation: INVOCATION,
    provider: PROVIDER_NAME,
    source: 'bundled',
    resourceBase: RESOURCE_BASE,
    rank: BUNDLED_SKILL_RANK,
    locator: SKILL_BODY_URL,
};
const provider = {
    name: PROVIDER_NAME,
    list: () => Promise.resolve([CANDIDATE]),
    async get() {
        return {
            name: CANDIDATE.name,
            description: CANDIDATE.description,
            invocation: CANDIDATE.invocation,
            provider: CANDIDATE.provider,
            source: CANDIDATE.source,
            resourceBase: RESOURCE_BASE,
            content: await readFile(SKILL_BODY_URL, 'utf8'),
        };
    },
};
/** Cordis 插件名称。 */
export const name = 'personal-todo-execution-skill';
/** 内置 skill 提供器依赖的服务。 */
export const inject = ['skills'];
/** 向 ctx.skills 注册内置 personal-todo-execution skill 提供器。 */
export function apply(ctx) {
    ctx.skills.registerProvider(() => provider);
}
//# sourceMappingURL=execution-skill.js.map
