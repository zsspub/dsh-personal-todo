/** Browser plugin adding a localized personal-todo manager to the sidebar footer. */
import personalTodoRemote from 'dsh-personal-todo/remote';
import { PersonalTodoPanel } from "./PersonalTodoPanel.js";
import { en, NS, zh } from "./locales.js";
export { PersonalTodoPanel } from "./PersonalTodoPanel.js";
export const inject = ['slots', 'locale', 'remote'];
function remoteFailure(result) {
    return new Error(`${result.error.message} (${result.error.code})`);
}
/** Mount the generated Remote namespace and register one additive sidebar action. */
export async function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'personal-todo: dictionaries');
    const disposeRemote = await ctx.remote.$mount(personalTodoRemote);
    const uiFiber = ctx.inject(['remote.personalTodo'], (scope) => {
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
                delete: async (id, signal) => {
                    const result = await scope.remote.personalTodo.delete({ id }, signal);
                    if (!result.ok)
                        throw remoteFailure(result);
                    return result.value;
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
