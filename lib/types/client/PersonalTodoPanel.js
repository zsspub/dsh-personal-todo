import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconCheckOutline16, IconEditOutline16, IconListPenOutline16, IconPlusOutline16, IconRefreshOutline16, IconTrashOutline16, Input, Modal, } from '@deepseek-ai/dsh-client-ui-primitives';
const CSS = `
.dsh-personal-todo-trigger{min-width:28px}
.dsh-personal-todo-dialog{width:min(920px,calc(100vw - 32px));max-width:none;height:min(760px,calc(100vh - 32px))}
.dsh-personal-todo-body{display:flex;flex-direction:column;min-height:0;height:100%;gap:14px}
.dsh-personal-todo-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-personal-todo-tabs{display:flex;gap:4px;padding:3px;border-radius:16px;background:var(--dsw-alias-bg-layer-3)}
.dsh-personal-todo-tab{border:0;border-radius:13px;padding:5px 12px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-personal-todo-tab[data-active=true]{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dsh-personal-todo-count{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-personal-todo-filters{display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,1fr) auto;gap:8px}
.dsh-personal-todo-list{display:flex;flex:1;min-height:0;flex-direction:column;gap:8px;overflow:auto;padding:2px}
.dsh-personal-todo-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:var(--dsw-alias-bg-layer-3)}
.dsh-personal-todo-item h3{margin:0;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;font-weight:500;overflow-wrap:anywhere}
.dsh-personal-todo-item p{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-personal-todo-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-personal-todo-badge{display:inline-flex;padding:2px 7px;border-radius:10px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary)}
.dsh-personal-todo-badge[data-priority=high]{color:var(--dsw-alias-label-error)}
.dsh-personal-todo-badge[data-priority=medium]{color:var(--dsw-alias-state-warn-label)}
.dsh-personal-todo-actions{display:flex;align-items:flex-start;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dsh-personal-todo-empty{padding:48px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-error{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-label-error);font-size:13px}
.dsh-personal-todo-more{align-self:center}
.dsh-personal-todo-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dsh-personal-todo-field{display:flex;flex-direction:column;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-personal-todo-field[data-wide=true]{grid-column:1/-1}
.dsh-personal-todo-field textarea,.dsh-personal-todo-field select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px}
.dsh-personal-todo-field textarea{min-height:100px;resize:vertical}
.dsh-personal-todo-field select{height:38px}
.dsh-personal-todo-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
.dsh-personal-todo-delete-dialog{width:min(420px,calc(100vw - 32px))}
@media(max-width:700px){.dsh-personal-todo-dialog{width:calc(100vw - 16px);height:calc(100vh - 16px)}.dsh-personal-todo-filters{grid-template-columns:1fr}.dsh-personal-todo-count{width:100%;margin-left:0}.dsh-personal-todo-item{grid-template-columns:1fr}.dsh-personal-todo-actions{justify-content:flex-start}.dsh-personal-todo-form{grid-template-columns:1fr}.dsh-personal-todo-field[data-wide=true]{grid-column:auto}.dsh-personal-todo-form-actions{grid-column:auto}}
`;
const EMPTY_FORM = {
    title: '',
    notes: '',
    status: 'pending',
    priority: 'none',
    dueLocal: '',
    tags: '',
};
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
function tagsFromText(value) {
    return value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
}
function localDateTime(value) {
    if (value === null)
        return '';
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
}
function formOf(todo) {
    return {
        id: todo.id,
        title: todo.title,
        notes: todo.notes ?? '',
        status: todo.status,
        priority: todo.priority,
        dueLocal: localDateTime(todo.dueAt),
        tags: todo.tags.join(', '),
    };
}
function dueAt(value) {
    return value === '' ? null : new Date(value).toISOString();
}
/** Sidebar action and modal manager for the shared personal todo database. */
export function PersonalTodoPanel({ wide, t, list, create, update, delete: deleteTodo }) {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState('active');
    const [todos, setTodos] = useState([]);
    const [result, setResult] = useState();
    const [searchDraft, setSearchDraft] = useState('');
    const [tagsDraft, setTagsDraft] = useState('');
    const [filters, setFilters] = useState({ search: '', tags: [] });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState();
    const [form, setForm] = useState();
    const [confirming, setConfirming] = useState();
    const controllers = useRef(new Set());
    const fetchPage = useCallback(async (offset, append = false) => {
        const controller = new AbortController();
        controllers.current.add(controller);
        setBusy(true);
        setError(undefined);
        try {
            const page = await list({
                statuses: view === 'active' ? ['pending', 'in_progress'] : ['completed'],
                ...(filters.search === '' ? {} : { search: filters.search }),
                ...(filters.tags.length === 0 ? {} : { tags: filters.tags }),
                offset,
            }, controller.signal);
            setTodos(current => append ? [...current, ...page.todos] : page.todos.slice());
            setResult(page);
        }
        catch (reason) {
            if (!controller.signal.aborted)
                setError(errorText(reason));
        }
        finally {
            controllers.current.delete(controller);
            setBusy(false);
        }
    }, [filters, list, view]);
    useEffect(() => {
        if (!open)
            return;
        void fetchPage(0);
    }, [fetchPage, open]);
    useEffect(() => () => {
        for (const controller of controllers.current)
            controller.abort();
        controllers.current.clear();
    }, []);
    const close = () => {
        for (const controller of controllers.current)
            controller.abort();
        controllers.current.clear();
        setBusy(false);
        setForm(undefined);
        setConfirming(undefined);
        setOpen(false);
    };
    const activeCount = (result?.counts.pending ?? 0) + (result?.counts.inProgress ?? 0);
    const summary = t('count.summary', { active: activeCount, completed: result?.counts.completed ?? 0 });
    const formTitle = form?.id === undefined ? t('action.add') : t('action.edit');
    const statusLabel = (status) => {
        if (status === 'pending')
            return t('status.pending');
        if (status === 'in_progress')
            return t('status.inProgress');
        return t('status.completed');
    };
    const priorityLabel = (priority) => {
        if (priority === 'none')
            return t('priority.none');
        if (priority === 'low')
            return t('priority.low');
        if (priority === 'medium')
            return t('priority.medium');
        return t('priority.high');
    };
    const mutate = async (operation) => {
        const controller = new AbortController();
        controllers.current.add(controller);
        setBusy(true);
        setError(undefined);
        try {
            await operation(controller.signal);
            await fetchPage(0);
            return true;
        }
        catch (reason) {
            if (!controller.signal.aborted)
                setError(errorText(reason));
            return false;
        }
        finally {
            controllers.current.delete(controller);
            setBusy(false);
        }
    };
    const saveForm = () => {
        if (form === undefined || form.title.trim() === '')
            return;
        const request = {
            title: form.title,
            notes: form.notes === '' ? null : form.notes,
            status: form.status,
            priority: form.priority,
            dueAt: dueAt(form.dueLocal),
            tags: tagsFromText(form.tags),
        };
        void mutate(signal => form.id === undefined
            ? create(request, signal)
            : update({ id: form.id, patch: request }, signal)).then((saved) => {
            if (saved)
                setForm(undefined);
        });
    };
    const emptyMessage = view === 'active' ? t('state.emptyActive') : t('state.emptyCompleted');
    const visibleTodos = useMemo(() => todos, [todos]);
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: CSS }), _jsx(Button, { className: "dsh-personal-todo-trigger", variant: "ghost", size: "sm", icon: _jsx(IconListPenOutline16, {}), "aria-label": t('trigger.aria'), title: t('trigger.aria'), onClick: () => { setOpen(true); }, children: wide ? t('trigger.label') : null }), _jsxs(Modal, { open: open, onClose: close, title: t('panel.title'), closeLabel: t('panel.close'), description: t('panel.description'), className: "dsh-personal-todo-dialog", contentClassName: "dsh-personal-todo-body", children: [_jsxs("div", { className: "dsh-personal-todo-toolbar", children: [_jsxs("div", { className: "dsh-personal-todo-tabs", children: [_jsx("button", { type: "button", className: "dsh-personal-todo-tab", "data-active": view === 'active', onClick: () => { setView('active'); }, children: t('tab.active') }), _jsx("button", { type: "button", className: "dsh-personal-todo-tab", "data-active": view === 'completed', onClick: () => { setView('completed'); }, children: t('tab.completed') })] }), _jsx(Button, { size: "sm", variant: "primary", icon: _jsx(IconPlusOutline16, {}), onClick: () => { setForm({ ...EMPTY_FORM }); }, children: t('action.add') }), _jsx(Button, { size: "sm", icon: _jsx(IconRefreshOutline16, {}), disabled: busy, onClick: () => { void fetchPage(0); }, children: t('action.refresh') }), _jsx("span", { className: "dsh-personal-todo-count", children: summary })] }), _jsxs("form", { className: "dsh-personal-todo-filters", onSubmit: (event) => {
                            event.preventDefault();
                            setFilters({ search: searchDraft.trim(), tags: tagsFromText(tagsDraft) });
                        }, children: [_jsx(Input, { value: searchDraft, onChange: event => { setSearchDraft(event.target.value); }, placeholder: t('search.placeholder'), "aria-label": t('search.aria') }), _jsx(Input, { value: tagsDraft, onChange: event => { setTagsDraft(event.target.value); }, placeholder: t('tags.placeholder'), "aria-label": t('tags.aria') }), _jsx(Button, { size: "sm", variant: "outline", type: "submit", children: t('action.apply') })] }), error !== undefined && _jsx("div", { className: "dsh-personal-todo-error", role: "alert", children: t('state.error', { message: error }) }), _jsxs("div", { className: "dsh-personal-todo-list", children: [busy && todos.length === 0 && _jsx("div", { className: "dsh-personal-todo-empty", children: t('state.loading') }), !busy && visibleTodos.length === 0 && _jsx("div", { className: "dsh-personal-todo-empty", children: emptyMessage }), visibleTodos.map(todo => (_jsxs("article", { className: "dsh-personal-todo-item", children: [_jsxs("div", { children: [_jsx("h3", { children: todo.title }), todo.notes !== null && _jsx("p", { children: todo.notes }), _jsxs("div", { className: "dsh-personal-todo-meta", children: [_jsx("span", { className: "dsh-personal-todo-badge", children: statusLabel(todo.status) }), _jsx("span", { className: "dsh-personal-todo-badge", "data-priority": todo.priority, children: priorityLabel(todo.priority) }), todo.tags.map(tag => _jsxs("span", { className: "dsh-personal-todo-badge", children: ["#", tag] }, tag)), todo.dueAt !== null && _jsx("span", { children: t('meta.due', { date: new Date(todo.dueAt).toLocaleString() }) }), todo.completedAt !== null && _jsx("span", { children: t('meta.completed', { date: new Date(todo.completedAt).toLocaleString() }) })] })] }), _jsxs("div", { className: "dsh-personal-todo-actions", children: [_jsx(Button, { size: "sm", icon: _jsx(IconEditOutline16, {}), disabled: busy, onClick: () => { setForm(formOf(todo)); }, children: t('action.edit') }), _jsx(Button, { size: "sm", icon: _jsx(IconCheckOutline16, {}), disabled: busy, onClick: () => {
                                                    void mutate(signal => update({ id: todo.id, patch: { status: todo.status === 'completed' ? 'pending' : 'completed' } }, signal));
                                                }, children: todo.status === 'completed' ? t('action.reopen') : t('action.complete') }), _jsx(Button, { size: "sm", icon: _jsx(IconTrashOutline16, {}), disabled: busy, onClick: () => { setConfirming(todo); }, children: t('action.delete') })] })] }, todo.id))), result?.hasMore === true && _jsx(Button, { className: "dsh-personal-todo-more", size: "sm", variant: "outline", disabled: busy, onClick: () => { void fetchPage(todos.length, true); }, children: t('action.loadMore') })] })] }), _jsx(Modal, { open: form !== undefined, onClose: () => { setForm(undefined); }, title: formTitle, closeLabel: t('action.cancel'), className: "dsh-personal-todo-delete-dialog", children: form !== undefined && _jsxs("div", { className: "dsh-personal-todo-form", children: [_jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.title'), _jsx(Input, { autoFocus: true, value: form.title, maxLength: 200, placeholder: t('field.titlePlaceholder'), onChange: event => { setForm({ ...form, title: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.notes'), _jsx("textarea", { value: form.notes, maxLength: 10_000, placeholder: t('field.notesPlaceholder'), onChange: event => { setForm({ ...form, notes: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", children: [t('field.status'), _jsxs("select", { value: form.status, onChange: event => { setForm({ ...form, status: event.target.value }); }, children: [_jsx("option", { value: "pending", children: t('status.pending') }), _jsx("option", { value: "in_progress", children: t('status.inProgress') }), _jsx("option", { value: "completed", children: t('status.completed') })] })] }), _jsxs("label", { className: "dsh-personal-todo-field", children: [t('field.priority'), _jsxs("select", { value: form.priority, onChange: event => { setForm({ ...form, priority: event.target.value }); }, children: [_jsx("option", { value: "none", children: t('priority.none') }), _jsx("option", { value: "low", children: t('priority.low') }), _jsx("option", { value: "medium", children: t('priority.medium') }), _jsx("option", { value: "high", children: t('priority.high') })] })] }), _jsxs("label", { className: "dsh-personal-todo-field", children: [t('field.dueAt'), _jsx(Input, { type: "datetime-local", value: form.dueLocal, onChange: event => { setForm({ ...form, dueLocal: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", children: [t('field.tags'), _jsx(Input, { value: form.tags, placeholder: t('field.tagsPlaceholder'), onChange: event => { setForm({ ...form, tags: event.target.value }); } })] }), _jsxs("div", { className: "dsh-personal-todo-form-actions", children: [_jsx(Button, { variant: "outline", onClick: () => { setForm(undefined); }, children: t('action.cancel') }), _jsx(Button, { variant: "primary", disabled: busy || form.title.trim() === '', onClick: saveForm, children: form.id === undefined ? t('action.create') : t('action.save') })] })] }) }), _jsx(Modal, { open: confirming !== undefined, onClose: () => { setConfirming(undefined); }, title: t('delete.title'), closeLabel: t('delete.close'), description: confirming === undefined ? '' : t('delete.description', { title: confirming.title }), className: "dsh-personal-todo-delete-dialog", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: () => { setConfirming(undefined); }, children: t('action.cancel') }), _jsx(Button, { variant: "primary", disabled: busy, onClick: () => {
                                if (confirming === undefined)
                                    return;
                                const id = confirming.id;
                                void mutate(signal => deleteTodo(id, signal)).then((deleted) => {
                                    if (deleted)
                                        setConfirming(undefined);
                                });
                            }, children: t('action.delete') })] }) })] }));
}
//# sourceMappingURL=PersonalTodoPanel.js.map
