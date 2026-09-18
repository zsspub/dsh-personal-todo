/** 将展示工具的持久化结果投影到所属回合末尾。 */
import { isPersonalTodoPresentationMeta } from "../presentation.js";
/** 从 Session 日志聚合成功的 `personal_todo_show` 调用。 */
export const personalTodoTurnDefinition = {
    kind: 'personal-todo',
    match(event) {
        if (event.type === 'turn/start')
            return { id: String(event.data.turn), role: 'start' };
        if (event.type === 'tool/call' && event.data.name === 'personal_todo_show') {
            return { id: String(event.data.turn), role: 'update' };
        }
        if (event.type === 'tool/result')
            return { id: String(event.data.turn), role: 'update' };
        return null;
    },
    start(_context, match) {
        if (match.event.type !== 'turn/start')
            throw new Error('个人待办回合投影需要 turn/start 事件。');
        return { turn: match.event.data.turn, calls: new Set(), results: [] };
    },
    update({ state }, { event }) {
        if (event.type === 'tool/call') {
            if (event.data.name !== 'personal_todo_show')
                return state;
            return { ...state, calls: new Set([...state.calls, String(event.data.callId)]) };
        }
        if (event.type !== 'tool/result' || event.data.message.content[0].isError === true)
            return state;
        const callId = String(event.data.message.source.callId);
        if (!state.calls.has(callId) || state.results.some(result => result.callId === callId))
            return state;
        if (!isPersonalTodoPresentationMeta(event.data.meta))
            return state;
        return {
            ...state,
            results: [...state.results, { callId, seq: event.seq, meta: event.data.meta }],
        };
    },
    buildLocationData({ state }, scope, previous) {
        if (scope !== 'turn' || state === undefined)
            return null;
        if (previous?.key === 'personal-todo' && previous.value.results === state.results)
            return previous;
        return {
            kind: 'turn',
            turn: state.turn,
            key: 'personal-todo',
            value: { results: state.results },
        };
    },
};
/** 选择结束位置之前最后一次成功的待办展示请求。 */
export function selectPersonalTodoTail(owner) {
    if (owner.turn.status !== 'closed')
        return null;
    return owner.turn.data.get('personal-todo')?.results.findLast(result => result.seq <= owner.seq) ?? null;
}
//# sourceMappingURL=turn-todos.js.map
