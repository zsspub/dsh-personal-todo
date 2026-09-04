import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { BUNDLED_SKILL_RANK } from "@deepseek-ai/dsh-skill";
//#region lib/types/execution-skill.js
/** Bundled `personal-todo-execution` skill provider. */
const PROVIDER_NAME = "personal-todo";
const SKILL_NAME = "personal-todo-execution";
const SKILL_BODY_URL = new URL("../assets/personal-todo-execution.md", import.meta.url);
const RESOURCE_BASE = {
	kind: "directory",
	path: fileURLToPath(new URL("../assets/", import.meta.url))
};
const CANDIDATE = {
	name: SKILL_NAME,
	description: "Standard operating procedure for autonomously executing a DSH personal todo — how to delegate to Codex, run independent workstreams, report progress, block on user input, and submit for review. Load this at the start of any personal todo run started from the personal-todo panel or the personal_todo tools.",
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
/** Cordis plugin name. */
const name = "personal-todo-execution-skill";
/** Service required by the bundled provider. */
const inject = ["skills"];
/** Register the bundled `personal-todo-execution` provider on `ctx.skills`. */
function apply(ctx) {
	ctx.skills.registerProvider(() => provider);
}
//#endregion
export { apply, inject, name };
