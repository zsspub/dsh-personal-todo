import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore, } from 'react';
import { Button, Menu, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { Archive, ArrowDown, CalendarDays, ChevronsUp, CircleCheck, CircleDot, CircleX, Ellipsis, Equal, ListTodo, MessageSquare, Pencil, Play, RefreshCw, Tag, Trash2, Undo2, UserRound, } from 'lucide-react';
import { isPersonalTodoPresentationMeta } from "../presentation.js";
import { NS } from "./locales.js";
import { requiresAgentStop, todoActionState } from "./todo-actions.js";
const EMPTY_QUERY = {
    ids: [],
    total: 0,
    counts: { pending: 0, inProgress: 0, completed: 0, cancelled: 0, archived: 0 },
    hasMore: false,
    loading: false,
    refreshing: false,
    error: undefined,
    updatedAt: undefined,
};
const CSS = `
.dsh-personal-todo-tool{display:flex;min-width:0;max-width:720px;flex-direction:column;margin:4px 0;border:.5px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;color:var(--dsw-alias-label-primary)}
.dsh-personal-todo-tool-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 16px 12px;border-bottom:.5px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-tool-title{display:flex;min-width:0;align-items:flex-start;gap:10px}.dsh-personal-todo-tool-title>svg{flex:none;margin-top:2px;color:var(--dsw-alias-label-secondary)}
.dsh-personal-todo-tool-title h3{margin:0;font-size:14px;line-height:20px;font-weight:600}.dsh-personal-todo-tool-title p{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dsh-personal-todo-tool-header-actions{display:flex;flex:none;align-items:center;gap:6px}
.dsh-personal-todo-tool-list{display:flex;max-height:440px;min-height:0;flex-direction:column;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l3) transparent}
.dsh-personal-todo-tool-item{display:flex;min-width:0;flex-direction:column;gap:8px;padding:13px 16px}.dsh-personal-todo-tool-item+.dsh-personal-todo-tool-item{border-top:.5px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-tool-item-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dsh-personal-todo-tool-item-heading h4{min-width:0;margin:0;font-size:14px;line-height:21px;font-weight:600;overflow-wrap:anywhere}
.dsh-personal-todo-tool-notes{display:-webkit-box;margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:19px;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3}
.dsh-personal-todo-tool-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:18px}
.dsh-personal-todo-tool-badge{display:inline-flex;align-items:center;gap:4px;max-width:100%;padding:2px 7px;border-radius:9px;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-secondary)}
.dsh-personal-todo-tool-badge svg{flex:none}.dsh-personal-todo-tool-badge span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-personal-todo-tool-badge[data-priority=high]{color:var(--dsw-alias-state-error-primary)}.dsh-personal-todo-tool-badge[data-priority=medium]{color:var(--dsw-alias-state-warn-label)}
.dsh-personal-todo-tool-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.dsh-personal-todo-tool-actions button{flex:none}
.dsh-personal-todo-tool-state{padding:24px 16px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px}
.dsh-personal-todo-tool-error{margin:10px 16px 0;padding:9px 10px;border-radius:10px;background:var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-label-error);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dsh-personal-todo-tool-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;border-top:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-tertiary);font-size:11px}
.dsh-personal-todo-tool-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}.dsh-personal-todo-tool-field{display:flex;min-width:0;flex-direction:column;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-personal-todo-tool-field[data-wide=true]{grid-column:1/-1}
.dsh-personal-todo-tool-field input,.dsh-personal-todo-tool-field select,.dsh-personal-todo-tool-field textarea{box-sizing:border-box;width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:9px 10px;font:inherit}.dsh-personal-todo-tool-field textarea{min-height:92px;resize:vertical}
@media(max-width:560px){.dsh-personal-todo-tool-header{padding:12px}.dsh-personal-todo-tool-list{max-height:380px}.dsh-personal-todo-tool-item{padding:12px}.dsh-personal-todo-tool-form{grid-template-columns:minmax(0,1fr)}.dsh-personal-todo-tool-field[data-wide=true]{grid-column:auto}}
`;
function parseObject(value) {
    try {
        const parsed = JSON.parse(value);
        return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed
            : undefined;
    }
    catch {
        return undefined;
    }
}
function parseQuery(value) {
    const parsed = parseObject(value);
    if (parsed === undefined)
        return undefined;
    return parsed;
}
function parseSnapshot(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const result = value;
    if (!Array.isArray(result.todos)
        || typeof result.total !== 'number'
        || typeof result.hasMore !== 'boolean'
        || result.counts === null
        || typeof result.counts !== 'object')
        return undefined;
    return result;
}
function textContent(content) {
    const text = content.find(block => block !== null && typeof block === 'object'
        && block.type === 'text'
        && typeof block.text === 'string');
    return text?.text;
}
function modelOf(block) {
    if (!('kind' in block))
        return { query: parseQuery(block.argsRaw), snapshot: undefined };
    if (isPersonalTodoPresentationMeta(block.meta)) {
        return { query: block.meta.query, snapshot: block.meta.snapshot };
    }
    const raw = textContent(block.content);
    return {
        query: block.call === null ? undefined : parseQuery(block.call.argsRaw),
        snapshot: raw === undefined ? undefined : parseSnapshot(parseObject(raw)),
    };
}
function dueLocal(value) {
    if (value === null)
        return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function formOf(todo) {
    return {
        id: todo.id,
        title: todo.title,
        notes: todo.notes ?? '',
        assignee: todo.assignee ?? '',
        priority: todo.priority,
        dueLocal: dueLocal(todo.dueAt),
        tags: todo.tags.join(', '),
    };
}
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/** 渲染展示工具及历史列表工具的实时待办卡片。 */
export function TodoToolCard({ block, dataCenter, openSession, t, }) {
    const model = useMemo(() => modelOf(block), [block]);
    const query = useMemo(() => {
        if (model.query === undefined)
            return undefined;
        const handle = dataCenter.query(model.query, 'all');
        if (model.snapshot !== undefined)
            handle.seed(model.snapshot);
        return handle;
    }, [dataCenter, model]);
    const snapshot = useSyncExternalStore(query?.subscribe ?? (() => () => undefined), query?.getSnapshot ?? (() => EMPTY_QUERY));
    const entities = useSyncExternalStore(listener => dataCenter.entities.listen(listener), dataCenter.entities.get);
    const mutations = useSyncExternalStore(listener => dataCenter.mutations.listen(listener), dataCenter.mutations.get);
    const deletedIds = useSyncExternalStore(listener => dataCenter.deletedIds.listen(listener), dataCenter.deletedIds.get);
    const [menuId, setMenuId] = useState();
    const [editForm, setEditForm] = useState();
    const [confirmation, setConfirmation] = useState();
    const [deleting, setDeleting] = useState();
    const [error, setError] = useState();
    const controllers = useRef(new Set());
    const fallbackTodos = useMemo(() => model.snapshot?.todos ?? [], [model.snapshot]);
    const fallbackById = useMemo(() => Object.fromEntries(fallbackTodos.map(todo => [todo.id, todo])), [fallbackTodos]);
    const ids = (query === undefined ? fallbackTodos.map(todo => todo.id) : snapshot.ids)
        .filter(id => deletedIds[id] === undefined);
    const todos = ids.flatMap(id => entities[id] ?? fallbackById[id] ?? []);
    const removedFallbackCount = fallbackTodos.reduce((count, todo) => count + (deletedIds[todo.id] === undefined ? 0 : 1), 0);
    const storedTotal = query === undefined
        ? Math.max(0, (model.snapshot?.total ?? todos.length) - removedFallbackCount)
        : snapshot.total;
    const queryError = query === undefined ? undefined : snapshot.error;
    const isRunning = !('kind' in block);
    const toolError = 'kind' in block && block.isError
        ? block.error === undefined ? t('card.toolError') : `${block.error.name} (${block.error.code})`
        : undefined;
    const visibleTodos = isRunning || toolError !== undefined ? [] : todos;
    const total = isRunning || toolError !== undefined ? 0 : storedTotal;
    useEffect(() => {
        dataCenter.seedTodos(fallbackTodos);
    }, [dataCenter, fallbackTodos]);
    useEffect(() => {
        if (query === undefined || !('kind' in block) || block.isError)
            return;
        void query.refresh().catch(() => undefined);
    }, [block, query]);
    useEffect(() => () => {
        for (const controller of controllers.current)
            controller.abort();
        controllers.current.clear();
    }, []);
    const run = async (operation) => {
        const controller = new AbortController();
        controllers.current.add(controller);
        setError(undefined);
        try {
            await operation(controller.signal);
            return true;
        }
        catch (reason) {
            setError(errorText(reason));
            return false;
        }
        finally {
            controllers.current.delete(controller);
        }
    };
    const lifecycle = (todo, label, action, operation) => {
        if (requiresAgentStop(todo, action))
            setConfirmation({ todo, label, action, run: operation });
        else
            void run(operation);
    };
    const saveEdit = () => {
        if (editForm === undefined || editForm.title.trim() === '')
            return;
        void run(signal => dataCenter.update({
            id: editForm.id,
            patch: {
                title: editForm.title,
                notes: editForm.notes.trim() === '' ? null : editForm.notes,
                assignee: editForm.assignee.trim() === '' ? null : editForm.assignee.trim(),
                priority: editForm.priority,
                dueAt: editForm.dueLocal === '' ? null : new Date(editForm.dueLocal).toISOString(),
                tags: editForm.tags.split(',').map(tag => tag.trim()).filter(Boolean),
            },
        }, signal)).then(saved => { if (saved)
            setEditForm(undefined); });
    };
    const filterLabel = model.query === undefined
        ? t('card.filterUnknown')
        : [
            model.query.archived === true ? t('tab.archived') : undefined,
            model.query.statuses?.map(status => status === 'in_progress' ? t('status.inProgress') : t(`status.${status}`)).join('、'),
            model.query.priorities === undefined ? undefined : t('card.priorities', {
                priorities: model.query.priorities.map(priority => t(`priority.${priority}`)).join('、'),
            }),
            model.query.tags === undefined ? undefined : t('card.tags', { tags: model.query.tags.join('、') }),
            model.query.dueBefore === undefined ? undefined : t('card.dueBefore', {
                dueBefore: new Date(model.query.dueBefore).toLocaleString(),
            }),
            model.query.search === undefined ? undefined : t('card.search', { search: model.query.search }),
        ].filter(Boolean).join(' · ') || t('card.filterDefault');
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: CSS }), _jsxs("section", { className: "dsh-personal-todo-tool", "aria-label": t('card.title'), children: [_jsxs("header", { className: "dsh-personal-todo-tool-header", children: [_jsxs("div", { className: "dsh-personal-todo-tool-title", children: [_jsx(ListTodo, { size: 18, "aria-hidden": "true" }), _jsxs("div", { children: [_jsx("h3", { children: t('card.title') }), _jsx("p", { children: filterLabel })] })] }), _jsxs("div", { className: "dsh-personal-todo-tool-header-actions", children: [_jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(RefreshCw, { size: 14, "aria-hidden": "true" }), disabled: query === undefined || snapshot.loading || snapshot.refreshing, "aria-label": t('card.refresh'), onClick: () => { void query?.refresh().catch(() => undefined); }, children: snapshot.refreshing ? t('card.refreshing') : t('card.refresh') }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => { dataCenter.openTodo(); }, children: t('card.openPanel') })] })] }), error !== undefined && _jsx("div", { className: "dsh-personal-todo-tool-error", role: "alert", children: error }), queryError !== undefined && _jsx("div", { className: "dsh-personal-todo-tool-error", role: "alert", children: t('card.refreshError', { message: queryError }) }), toolError !== undefined && _jsx("div", { className: "dsh-personal-todo-tool-error", role: "alert", children: toolError }), isRunning && _jsx("div", { className: "dsh-personal-todo-tool-state", children: t('state.loading') }), !isRunning && toolError === undefined && !snapshot.loading && visibleTodos.length === 0 && _jsx("div", { className: "dsh-personal-todo-tool-state", children: t('card.empty') }), visibleTodos.length > 0 && _jsx("div", { className: "dsh-personal-todo-tool-list", children: visibleTodos.map(todo => {
                            const state = todoActionState(todo);
                            const mutating = mutations[todo.id] !== undefined;
                            const statusLabel = todo.status === 'in_progress' ? t('status.inProgress') : t(`status.${todo.status}`);
                            const priorityLabel = t(`priority.${todo.priority}`);
                            const entries = [];
                            if (todo.status === 'pending')
                                entries.push({ id: 'manualStart', label: t('action.manualStart') });
                            if (todo.status === 'in_progress')
                                entries.push({ id: 'pending', label: t('action.pending') });
                            if (state.canReopen)
                                entries.push({ id: 'reopen', label: t('action.reopen') });
                            if (state.canStart)
                                entries.push({ id: 'start', label: t('action.start'), icon: _jsx(Play, { size: 14 }) });
                            if (state.running)
                                entries.push({ id: 'stop', label: t('action.takeOver'), icon: _jsx(CircleX, { size: 14 }) });
                            entries.push({ id: 'edit', label: t('action.edit'), icon: _jsx(Pencil, { size: 14 }) });
                            if (state.canArchive)
                                entries.push({ id: 'archive', label: t('action.archive'), icon: _jsx(Archive, { size: 14 }) });
                            if (state.canRestore)
                                entries.push({ id: 'restore', label: t('action.restore'), icon: _jsx(Undo2, { size: 14 }) });
                            if (state.canCancel)
                                entries.push({ id: 'cancel', label: t('action.cancelTask'), icon: _jsx(CircleX, { size: 14 }) });
                            if (state.canDelete)
                                entries.push({ id: 'delete', label: t('action.delete'), icon: _jsx(Trash2, { size: 14 }), danger: true });
                            const select = (action) => {
                                setMenuId(undefined);
                                if (mutating)
                                    return;
                                if (action === 'manualStart')
                                    void run(signal => dataCenter.setStatus({ id: todo.id, status: 'in_progress' }, signal));
                                if (action === 'pending')
                                    lifecycle(todo, t('action.pending'), 'pending', signal => dataCenter.setStatus({ id: todo.id, status: 'pending' }, signal));
                                if (action === 'reopen')
                                    void run(signal => dataCenter.setStatus({ id: todo.id, status: 'pending' }, signal));
                                if (action === 'start')
                                    void run(signal => dataCenter.start(todo.id, signal));
                                if (action === 'stop')
                                    lifecycle(todo, t('action.takeOver'), 'stop', signal => dataCenter.stop(todo.id, signal));
                                if (action === 'edit')
                                    setEditForm(formOf(todo));
                                if (action === 'archive')
                                    lifecycle(todo, t('action.archive'), 'archive', signal => dataCenter.archive(todo.id, signal));
                                if (action === 'restore')
                                    void run(signal => dataCenter.restore(todo.id, signal));
                                if (action === 'cancel')
                                    lifecycle(todo, t('action.cancelTask'), 'cancel', signal => dataCenter.setStatus({ id: todo.id, status: 'cancelled' }, signal));
                                if (action === 'delete')
                                    setDeleting(todo);
                            };
                            return _jsxs("article", { className: "dsh-personal-todo-tool-item", children: [_jsxs("div", { className: "dsh-personal-todo-tool-item-heading", children: [_jsx("h4", { children: todo.title }), _jsxs("span", { className: "dsh-personal-todo-tool-badge", children: [_jsx(CircleDot, { size: 12, "aria-hidden": "true" }), _jsx("span", { children: statusLabel })] })] }), todo.notes !== null && _jsx("p", { className: "dsh-personal-todo-tool-notes", children: todo.notes }), _jsxs("div", { className: "dsh-personal-todo-tool-meta", children: [todo.executionStatus !== null && _jsx("span", { className: "dsh-personal-todo-tool-badge", children: _jsx("span", { children: t(`execution.${todo.executionStatus}`) }) }), _jsxs("span", { className: "dsh-personal-todo-tool-badge", children: [_jsx(UserRound, { size: 12, "aria-hidden": "true" }), _jsx("span", { children: todo.assignee ?? t('assignee.unassigned') })] }), todo.priority !== 'none' && _jsxs("span", { className: "dsh-personal-todo-tool-badge", "data-priority": todo.priority, children: [todo.priority === 'high' ? _jsx(ChevronsUp, { size: 12 }) : todo.priority === 'medium' ? _jsx(Equal, { size: 12 }) : _jsx(ArrowDown, { size: 12 }), _jsx("span", { children: priorityLabel })] }), todo.dueAt !== null && _jsxs("span", { className: "dsh-personal-todo-tool-badge", children: [_jsx(CalendarDays, { size: 12, "aria-hidden": "true" }), _jsx("span", { children: new Date(todo.dueAt).toLocaleString() })] }), todo.tags.map(tag => _jsxs("span", { className: "dsh-personal-todo-tool-badge", children: [_jsx(Tag, { size: 12, "aria-hidden": "true" }), _jsx("span", { children: tag })] }, tag))] }), _jsxs("div", { className: "dsh-personal-todo-tool-actions", children: [_jsx(Button, { size: "sm", variant: "outline", disabled: mutating, onClick: () => { dataCenter.openTodo(todo.id); }, children: t('card.viewDetail') }), state.canComplete && _jsx(Button, { size: "sm", variant: "primary", icon: _jsx(CircleCheck, { size: 14, "aria-hidden": "true" }), disabled: mutating, onClick: () => { lifecycle(todo, t('action.complete'), 'complete', signal => dataCenter.approve(todo.id, signal)); }, children: t('action.complete') }), state.canOpenConversation && _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(MessageSquare, { size: 14, "aria-hidden": "true" }), disabled: mutating, onClick: () => {
                                                    void run(async () => {
                                                        const opened = await openSession(todo.primarySessionId, null);
                                                        if (!opened)
                                                            throw new Error(t('state.sessionUnavailable'));
                                                    });
                                                }, children: t('action.openConversation') }), _jsx(Menu, { open: menuId === todo.id, onClose: () => { setMenuId(undefined); }, items: entries.map(entry => 'type' in entry ? entry : { ...entry, disabled: mutating }), onSelect: select, align: "end", portal: true, dense: true, anchor: _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Ellipsis, { size: 14, "aria-hidden": "true" }), disabled: mutating, "aria-label": t('action.moreActions'), "aria-haspopup": "menu", "aria-expanded": menuId === todo.id, onClick: () => { setMenuId(current => current === todo.id ? undefined : todo.id); }, children: t('action.more') }) })] })] }, todo.id);
                        }) }), _jsxs("footer", { className: "dsh-personal-todo-tool-footer", children: [_jsx("span", { children: t('card.total', { count: total }) }), _jsx("span", { children: snapshot.refreshing
                                    ? t('card.refreshing')
                                    : query === undefined || snapshot.updatedAt === undefined
                                        ? t('card.snapshot')
                                        : t('card.live') })] })] }), _jsx(Modal, { open: editForm !== undefined, onClose: () => { setEditForm(undefined); }, title: t('action.edit'), closeLabel: t('action.cancel'), footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: () => { setEditForm(undefined); }, children: t('action.cancel') }), _jsx(Button, { variant: "primary", disabled: editForm?.title.trim() === '', onClick: saveEdit, children: t('action.save') })] }), children: editForm !== undefined && _jsxs("div", { className: "dsh-personal-todo-tool-form", children: [_jsxs("label", { className: "dsh-personal-todo-tool-field", "data-wide": "true", children: [t('field.title'), _jsx("input", { value: editForm.title, maxLength: 200, onChange: event => { setEditForm({ ...editForm, title: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-tool-field", "data-wide": "true", children: [t('field.notes'), _jsx("textarea", { value: editForm.notes, maxLength: 10_000, onChange: event => { setEditForm({ ...editForm, notes: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-tool-field", children: [t('field.assignee'), _jsx("input", { value: editForm.assignee, maxLength: 100, onChange: event => { setEditForm({ ...editForm, assignee: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-tool-field", children: [t('field.priority'), _jsxs("select", { value: editForm.priority, onChange: event => { setEditForm({ ...editForm, priority: event.target.value }); }, children: [_jsx("option", { value: "none", children: t('priority.none') }), _jsx("option", { value: "low", children: t('priority.low') }), _jsx("option", { value: "medium", children: t('priority.medium') }), _jsx("option", { value: "high", children: t('priority.high') })] })] }), _jsxs("label", { className: "dsh-personal-todo-tool-field", "data-wide": "true", children: [t('field.dueAt'), _jsx("input", { type: "datetime-local", value: editForm.dueLocal, onChange: event => { setEditForm({ ...editForm, dueLocal: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-tool-field", "data-wide": "true", children: [t('field.tags'), _jsx("input", { value: editForm.tags, onChange: event => { setEditForm({ ...editForm, tags: event.target.value }); } })] })] }) }), _jsx(Modal, { open: confirmation !== undefined, onClose: () => { setConfirmation(undefined); }, title: t('execution.stopTitle'), closeLabel: t('execution.stopClose'), description: t('execution.stopDescription', { action: confirmation?.label ?? '' }), footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: () => { setConfirmation(undefined); }, children: t('action.cancel') }), _jsx(Button, { variant: "primary", onClick: () => {
                                if (confirmation === undefined)
                                    return;
                                void run(confirmation.run).then(saved => { if (saved)
                                    setConfirmation(undefined); });
                            }, children: t('execution.stopConfirm') })] }) }), _jsx(Modal, { open: deleting !== undefined, onClose: () => { setDeleting(undefined); }, title: t('delete.title'), closeLabel: t('delete.close'), description: deleting === undefined ? '' : t('delete.description', { title: deleting.title }), footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: () => { setDeleting(undefined); }, children: t('action.cancel') }), _jsx(Button, { variant: "primary", onClick: () => {
                                if (deleting === undefined)
                                    return;
                                void run(signal => dataCenter.delete(deleting.id, signal)).then(saved => { if (saved)
                                    setDeleting(undefined); });
                            }, children: t('action.delete') })] }) })] }));
}
//# sourceMappingURL=TodoToolCard.js.map
