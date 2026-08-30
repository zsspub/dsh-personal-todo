//#region lib/types/types.js
/** JSON-safe contracts shared by the Host service, Agent tools, and Web client. */
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
