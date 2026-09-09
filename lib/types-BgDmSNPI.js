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
//#endregion
export { TODO_STATUSES as n, TODO_PRIORITIES as t };
