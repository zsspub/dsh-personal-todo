import { jsx as _jsx } from "react/jsx-runtime";
/** 在回合结束位置渲染待办展示卡片。 */
import React from 'react';
import { TodoToolCard } from "./TodoToolCard.js";
import { NS } from "./locales.js";
function blockOf(result) {
    return {
        kind: 'tool-result',
        seq: result.seq,
        time: 0,
        callId: result.callId,
        call: {
            name: 'personal_todo_show',
            argsRaw: JSON.stringify(result.meta.query),
        },
        callTime: null,
        content: [],
        isError: false,
        meta: result.meta,
        subCalls: [],
    };
}
/** 将回合投影恢复为现有待办卡片所需的稳定展示模型。 */
export function TodoTurnTail({ matched, dataCenter, openSession, t, }) {
    return (_jsx(TodoToolCard, { block: blockOf(matched), dataCenter: dataCenter, openSession: openSession, t: t }));
}
//# sourceMappingURL=TodoTurnTail.js.map
