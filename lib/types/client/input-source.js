export const TODO_SOURCE = 'personal-todo';
const categories = ['pending', 'in_progress', 'blocked', 'in_review'];
const statusKeys = {
    pending: 'status.pending', in_progress: 'status.inProgress', blocked: 'status.blocked',
    in_review: 'status.inReview',
};
const countKeys = {
    pending: 'pending', in_progress: 'inProgress', blocked: 'blocked', in_review: 'inReview',
};
function categoryPath(query) {
    const match = /^todo\/([^/]+)\/(.*)$/s.exec(query);
    if (!match || !categories.includes(match[1]))
        return undefined;
    return { category: match[1], search: match[2] };
}
/** Status folders drill into live Host todos; references resolve again when sent. */
export function createTodoInputSource(api, t) {
    return {
        trigger: '@',
        name: TODO_SOURCE,
        showGroupTitle: false,
        async candidates(_session, { query, quoted, signal }) {
            if (quoted)
                return [];
            signal.throwIfAborted();
            const path = categoryPath(query);
            if (!path) {
                if (query.includes('/'))
                    return [];
                const needle = query.trim().toLocaleLowerCase();
                const matches = categories.filter(category => `${t('panel.title')} todo ${category} ${t(statusKeys[category])}`.toLocaleLowerCase().includes(needle));
                if (!matches.length)
                    return [];
                const { counts } = await api.list({ limit: 1 }, signal);
                signal.throwIfAborted();
                return matches.map(category => ({
                    name: t(statusKeys[category]),
                    description: String(counts[countKeys[category]]),
                    section: t('panel.title'),
                    icon: 'folder',
                    value: `@todo/${category}/`,
                    drill: true,
                }));
            }
            const search = path.search.trim();
            if (search.length > 500)
                return [];
            const result = await api.list({
                statuses: [path.category],
                search, limit: 50,
            }, signal);
            signal.throwIfAborted();
            return result.todos.map(todo => ({
                name: todo.title,
                description: [todo.assignee, todo.notes, todo.id].filter(Boolean).join(' · '),
                section: `${t('panel.title')} · ${t(statusKeys[path.category])}${result.hasMore ? ` · ${t('input.refine')}` : ''}`,
                icon: 'file',
                value: todo.id,
            }));
        },
        header(_session, { query }) {
            const path = categoryPath(query);
            if (!path)
                return undefined;
            return [
                { label: t('panel.title'), value: '@' },
                { label: t(statusKeys[path.category]), value: `@todo/${path.category}/`, current: true },
            ];
        },
        onPick({ candidate, action }) {
            if (candidate.value === '@' || (candidate.value?.startsWith('@') && categoryPath(candidate.value.slice(1)))) {
                return { text: candidate.value, continue: true };
            }
            if (action === 'drill' || !candidate.value)
                return undefined;
            return { insert: {
                    source: TODO_SOURCE,
                    ref: candidate.value,
                    label: candidate.name,
                    appearance: 'file',
                    clipboardText: `personal-todo:${candidate.value}`,
                } };
        },
        codec: {
            clipboardText: ref => `personal-todo:${ref}`,
            async serialize(ref, signal) {
                signal.throwIfAborted();
                const { todo } = await api.get(ref, signal);
                signal.throwIfAborted();
                return `Personal todo reference (personalTodo.get):\n${JSON.stringify(todo, null, 2)}`;
            },
        },
    };
}
//# sourceMappingURL=input-source.js.map
