//#region lib/types/types.js
/** Host 服务、Agent 工具和 Web 客户端共用的 JSON 可序列化类型契约。 */
const TODO_STATUSES = [
	"pending",
	"in_progress",
	"blocked",
	"in_review",
	"completed",
	"cancelled"
];
const TODO_PRIORITIES = [
	"none",
	"low",
	"medium",
	"high"
];
const TODO_RUN_STATUSES = [
	"running",
	"waiting_input",
	"submitted",
	"failed",
	"cancelled"
];
const TODO_EVENT_TYPES = [
	"created",
	"updated",
	"run_started",
	"progress",
	"blocked",
	"user_replied",
	"review_submitted",
	"review_approved",
	"changes_requested",
	"run_failed",
	"cancelled",
	"archived",
	"restored"
];
//#endregion
export { TODO_STATUSES as i, TODO_PRIORITIES as n, TODO_RUN_STATUSES as r, TODO_EVENT_TYPES as t };
