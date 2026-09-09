/** 在侧栏底部添加支持多语言的个人待办管理入口。 */
import personalTodoRemote from 'dsh-personal-todo/remote';
import { PersonalTodoCanvas, PersonalTodoTrigger, } from "./PersonalTodoPanel.js";
import { createTodoInputSource } from "./input-source.js";
import { PersonalTodoCanvasController } from "./canvas.js";
import { en, NS, zh } from "./locales.js";
export { PersonalTodoCanvas, PersonalTodoTrigger } from "./PersonalTodoPanel.js";
export const inject = ['slots', 'locale', 'remote', 'sessions'];
function remoteFailure(result) {
    return new Error(`${result.error.message} (${result.error.code})`);
}
/** 挂载生成的 Remote 命名空间，并注册侧栏入口和待办面板。 */
export async function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'personal-todo: dictionaries');
    const disposeRemote = await ctx.remote.$mount(personalTodoRemote);
    const canvas = new PersonalTodoCanvasController();
    const uiFiber = ctx.inject(['remote.personalTodo'], (scope) => {
        const sessions = scope.sessions;
        const panel = () => ({
            canvas,
            openCanvas: () => { canvas.open(); },
            closeCanvas: () => { canvas.close(); },
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
            archive: async (id, signal) => {
                const result = await scope.remote.personalTodo.archive({ id }, signal);
                if (!result.ok)
                    throw remoteFailure(result);
                return result.value;
            },
            restore: async (id, signal) => {
                const result = await scope.remote.personalTodo.restore({ id }, signal);
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
        });
        scope.inject(['inputTriggers'], inputScope => {
            const t = inputScope.locale.bind(NS);
            inputScope.effect(() => inputScope.inputTriggers.registerSource(createTodoInputSource({
                list: async (request, signal) => {
                    const result = await inputScope.remote.personalTodo.list(request, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
                get: async (id, signal) => {
                    const result = await inputScope.remote.personalTodo.get({ id }, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
                },
            }, t)), 'personal-todo: input references');
        });
        scope.slots.inject('sidebar.footer.action', () => scope.slots.register({
            name: 'sidebar.footer.action',
            id: 'personal-todo',
            order: 40,
            locale: NS,
            inject: panel,
        }, PersonalTodoTrigger));
        scope.slots.inject('shell.overlay', () => scope.slots.register({
            name: 'shell.overlay',
            id: 'personal-todo',
            order: 40,
            locale: NS,
            inject: panel,
        }, PersonalTodoCanvas));
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
