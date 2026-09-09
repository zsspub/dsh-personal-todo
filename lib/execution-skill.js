import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region lib/types/execution-skill.js
/** 内置 personal-todo-execution skill 的提供器。 */
const PROVIDER_NAME = "personal-todo";
const SKILL_NAME = "personal-todo-execution";
const SKILL_BODY_URL = new URL("../assets/personal-todo-execution.md", import.meta.url);
const RESOURCE_BASE = {
	kind: "directory",
	path: fileURLToPath(new URL("../assets/", import.meta.url))
};
const CANDIDATE = {
	name: SKILL_NAME,
	description: "自主执行 DSH 个人待办的标准流程：选择执行方式、汇报进度、请求用户输入并提交审核。从个人待办面板或 personal_todo 工具启动执行时，应先加载本 skill。",
	invocation: {
		modelInvocable: true,
		userInvocable: false
	},
	provider: PROVIDER_NAME,
	source: "bundled",
	resourceBase: RESOURCE_BASE,
	rank: BUNDLED_SKILL_RANK,
	locator: SKILL_BODY_URL
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
			content: await readFile(SKILL_BODY_URL, "utf8")
		};
	}
};
/** Cordis 插件名称。 */
const name = "personal-todo-execution-skill";
/** 内置 skill 提供器依赖的服务。 */
const inject = ["skills"];
/** 向 ctx.skills 注册内置 personal-todo-execution skill 提供器。 */
function apply(ctx) {
	ctx.skills.registerProvider(() => provider);
}
//#endregion
export { apply, inject, name };
