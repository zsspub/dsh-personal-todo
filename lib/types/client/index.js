/** Browser plugin adding a localized personal-todo manager to the sidebar footer. */
import personalTodoRemote from 'dsh-personal-todo/remote';
import { PersonalTodoPanel } from "./PersonalTodoPanel.js";
import { en, NS, zh } from "./locales.js";
export { PersonalTodoPanel } from "./PersonalTodoPanel.js";
export const inject = ['slots', 'locale', 'remote', 'sessions'];
function remoteFailure(result) {
    return new Error(`${result.error.message} (${result.error.code})`);
}
/** Mount the generated Remote namespace and register one additive sidebar action. */
export async function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'personal-todo: dictionaries');
    const disposeRemote = await ctx.remote.$mount(personalTodoRemote);
    const uiFiber = ctx.inject(['remote.personalTodo'], (scope) => {
        const sessions = scope.sessions;
        scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
            name: 'sidebar.footer.action',
            id: 'personal-todo',
            order: 40,
            locale: NS,
            inject: () => ({
                list: async (request, signal) => {
                    const result = await scope.remote.personalTodo.list(request, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                get: async (id, signal) => {
                    const result = await scope.remote.personalTodo.get({ id }, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                create: async (request, signal) => {
                    const result = await scope.remote.personalTodo.create(request, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                update: async (request, signal) => {
                    const result = await scope.remote.personalTodo.update(request, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                start: async (id, signal) => {
                    const result = await scope.remote.personalTodo.start({ id }, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                reply: async (request, signal) => {
                    const result = await scope.remote.personalTodo.reply(request, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                approve: async (id, signal) => {
                    const result = await scope.remote.personalTodo.approve({ id }, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                requestChanges: async (request, signal) => {
                    const result = await scope.remote.personalTodo.requestChanges(request, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                delete: async (id, signal) => {
                    const result = await scope.remote.personalTodo.delete({ id }, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                openSession: async (id, parentId) => {
                    const sessionId = id;
                    if (parentId === null) {
                        sessions.open(sessionId);
                        return true;
                    }
                    const retained = sessions.subagentAddress(sessionId);
                    if (retained !== undefined) {
                        sessions.openSubagent(retained);
                        return true;
                    }
                    const parentSessionId = parentId;
                    sessions.open(parentSessionId);
                    await sessions.refreshSubagents(parentSessionId);
                    const child = sessions.list.getSnapshot().subagentsByParent[parentSessionId]?.entries
                        .find(entry => entry.kind === 'child' && entry.id === sessionId);
                    if (child?.kind !== 'child')
                        return false;
                    sessions.openSubagent({ parentSessionId, childSessionId: sessionId, mode: child.mode });
                    return true;
                },
            }),
        }, PersonalTodoPanel));
    });
    try {
        await uiFiber;
    }
    catch (error) {
        await disposeRemote();
        throw error;
    }
    return async () => {
        await uiFiber.dispose();
        await disposeRemote();
    };
}
//# sourceMappingURL=index.js.map
