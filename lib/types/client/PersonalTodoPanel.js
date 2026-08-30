import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconEditOutline16, IconListPenOutline16, IconPlusOutline16, IconRefreshOutline16, IconTrashOutline16, Input, Modal, } from '@deepseek-ai/dsh-client-ui-primitives';
import { TODO_STATUSES } from "../types.js";
// The slot renderer anchors list slots with inline `display: contents`. A wide
// sidebar reifies that wrapper so every footer action occupies its own row.
const CSS = `
.dsh-personal-todo-trigger{position:relative;min-width:28px}
.dsh-personal-todo-attention{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;margin-left:auto;padding:0 5px;border-radius:9px;background:var(--dsw-alias-label-error);color:var(--dsw-alias-bg-layer-1);font-size:11px;line-height:18px}
.dsh-personal-todo-trigger[data-wide=false] .dsh-personal-todo-attention{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 4px;line-height:16px}
[data-slot='sidebar.footer.action']:has(.dsh-personal-todo-trigger[data-wide=true]){display:flex!important;flex:1;flex-direction:column;min-width:0;width:100%}
.dsh-personal-todo-trigger[data-wide=true]{justify-content:flex-start;width:100%}
.dsh-personal-todo-dialog{width:min(1180px,calc(100vw - 32px));max-width:none;height:min(820px,calc(100vh - 32px))}
.dsh-personal-todo-body{display:flex;flex-direction:column;min-height:0;height:100%;gap:8px}
.dsh-personal-todo-toolbar{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}
.dsh-personal-todo-tabs{display:flex;gap:4px;padding:3px;border-radius:16px;background:var(--dsw-alias-bg-layer-3)}
.dsh-personal-todo-tab{border:0;border-radius:13px;padding:5px 12px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-personal-todo-tab[data-active=true]{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dsh-personal-todo-count{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-personal-todo-filters{display:grid;grid-template-columns:minmax(160px,1fr) minmax(160px,1fr) auto;gap:8px}
.dsh-personal-todo-workspace{display:grid;grid-template-columns:minmax(0,2fr) minmax(300px,1fr);flex:1;min-height:0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden}
.dsh-personal-todo-workspace[data-has-selection=false]{grid-template-columns:minmax(0,1fr)}.dsh-personal-todo-workspace[data-has-selection=false] .dsh-personal-todo-detail-pane{display:none}
.dsh-personal-todo-list{display:flex;min-height:0;flex-direction:column;gap:8px;overflow:auto;padding:10px;background:var(--dsw-alias-bg-layer-2);border-right:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-lanes{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(180px,1fr);align-items:start;gap:8px;min-width:100%}.dsh-personal-todo-lane{display:flex;min-width:0;flex-direction:column;gap:8px}.dsh-personal-todo-lane-title{padding:2px 2px 0}
.dsh-personal-todo-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:11px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}
.dsh-personal-todo-item[data-selected=true]{border-color:var(--dsw-alias-button-primary-fill)}
.dsh-personal-todo-select{display:block;width:100%;padding:0;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit}
.dsh-personal-todo-item h3,.dsh-personal-todo-lane h3,.dsh-personal-todo-detail h2,.dsh-personal-todo-detail h3{margin:0;color:var(--dsw-alias-label-primary);font-weight:500;overflow-wrap:anywhere}
.dsh-personal-todo-item h3,.dsh-personal-todo-lane h3{font-size:14px;line-height:21px}.dsh-personal-todo-detail h2{font-size:18px}.dsh-personal-todo-detail h3{font-size:13px;margin-top:16px}
.dsh-personal-todo-item p,.dsh-personal-todo-detail p{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-personal-todo-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-personal-todo-badge{display:inline-flex;padding:2px 7px;border-radius:10px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary)}
.dsh-personal-todo-badge[data-status=in_review]{color:var(--dsw-alias-state-success-label)}.dsh-personal-todo-badge[data-status=blocked]{color:var(--dsw-alias-state-warn-label)}
.dsh-personal-todo-badge[data-priority=high]{color:var(--dsw-alias-label-error)}.dsh-personal-todo-badge[data-priority=medium]{color:var(--dsw-alias-state-warn-label)}
.dsh-personal-todo-actions{display:flex;align-items:flex-start;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dsh-personal-todo-empty{padding:48px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-error{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-label-error);font-size:13px}
.dsh-personal-todo-more{align-self:center}.dsh-personal-todo-detail-pane{display:flex;flex-direction:column;min-width:0;min-height:0}.dsh-personal-todo-detail{min-width:0;min-height:0;flex:1;overflow:auto;padding:18px 20px}
.dsh-personal-todo-detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dsh-personal-todo-detail-actions{display:flex;gap:6px;flex-wrap:wrap}
.dsh-personal-todo-back{display:none;margin-bottom:10px}
.dsh-personal-todo-callout{margin-top:14px;padding:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-review{margin-top:14px;padding:14px;border-radius:12px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-review dl{display:grid;grid-template-columns:90px 1fr;gap:7px;margin:10px 0;font-size:13px}.dsh-personal-todo-review dt{color:var(--dsw-alias-label-tertiary)}.dsh-personal-todo-review dd{margin:0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.dsh-personal-todo-commandbar{display:flex;align-items:flex-end;gap:10px;flex:none;padding:10px 20px 12px}.dsh-personal-todo-commandbar textarea{min-width:0;min-height:72px;flex:1}.dsh-personal-todo-commandbar-actions{display:flex;gap:8px;flex:none}
.dsh-personal-todo-timeline{display:flex;flex-direction:column;gap:8px;margin-top:8px}.dsh-personal-todo-event{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:start;font-size:12px;color:var(--dsw-alias-label-secondary)}.dsh-personal-todo-event time{color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-session{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding:10px;border-radius:10px;background:var(--dsw-alias-bg-layer-3);font-size:13px}
.dsh-personal-todo-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dsh-personal-todo-field{display:flex;flex-direction:column;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-personal-todo-field[data-wide=true]{grid-column:1/-1}
.dsh-personal-todo-field textarea,.dsh-personal-todo-commandbar textarea{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px;resize:vertical}.dsh-personal-todo-field textarea{min-height:100px}
.dsh-personal-todo-field select{width:100%;height:38px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px}
.dsh-personal-todo-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.dsh-personal-todo-small-dialog{width:min(480px,calc(100vw - 32px))}
@media(max-width:800px){.dsh-personal-todo-dialog{width:calc(100vw - 16px);height:calc(100vh - 16px)}.dsh-personal-todo-filters{grid-template-columns:1fr}.dsh-personal-todo-count{width:100%;margin-left:0}.dsh-personal-todo-workspace{grid-template-columns:1fr}.dsh-personal-todo-workspace[data-has-selection=true] .dsh-personal-todo-list{display:none}.dsh-personal-todo-workspace[data-has-selection=false] .dsh-personal-todo-detail-pane{display:none}.dsh-personal-todo-list{border-right:0}.dsh-personal-todo-lanes{grid-auto-flow:row;grid-auto-columns:auto}.dsh-personal-todo-back{display:inline-flex}.dsh-personal-todo-detail{padding:14px}.dsh-personal-todo-detail-header{flex-direction:column}.dsh-personal-todo-commandbar{align-items:stretch;flex-direction:column;padding:10px 14px 12px}.dsh-personal-todo-commandbar-actions{justify-content:flex-end}.dsh-personal-todo-form{grid-template-columns:1fr}.dsh-personal-todo-field[data-wide=true],.dsh-personal-todo-form-actions{grid-column:auto}}
`;
const EMPTY_FORM = { title: '', notes: '', priority: 'none', dueLocal: '', tags: '' };
const ACTIVE_REFRESH_MS = 2_000;
const ACTIVE_STATUSES = ['pending', 'in_progress', 'blocked', 'in_review'];
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
        priority: todo.priority,
        dueLocal: localDateTime(todo.dueAt),
        tags: todo.tags.join(', '),
    };
}
function dueAt(value) {
    return value === '' ? null : new Date(value).toISOString();
}
/** Sidebar action and task-driven personal todo center. */
export function PersonalTodoPanel(props) {
    const { wide, t, list, get, create, update, start, reply, approve, archive, restore, requestChanges, delete: deleteTodo, openSession } = props;
    const [open, setOpen] = useState(false);
    const [view, setView] = useState('active');
    const [todos, setTodos] = useState([]);
    const [result, setResult] = useState();
    const [attentionCount, setAttentionCount] = useState(0);
    const [selectedId, setSelectedId] = useState();
    const [detail, setDetail] = useState();
    const [searchDraft, setSearchDraft] = useState('');
    const [tagsDraft, setTagsDraft] = useState('');
    const [filters, setFilters] = useState({ search: '', tags: [] });
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState();
    const [form, setForm] = useState();
    const [confirming, setConfirming] = useState();
    const [replyText, setReplyText] = useState('');
    const [feedback, setFeedback] = useState('');
    const controllers = useRef(new Set());
    const withController = async (operation) => {
        const controller = new AbortController();
        controllers.current.add(controller);
        try {
            return await operation(controller.signal);
        }
        finally {
            controllers.current.delete(controller);
        }
    };
    const fetchDetail = useCallback(async (id) => {
        try {
            const value = await withController(signal => get(id, signal));
            setDetail(value);
        }
        catch (reason) {
            setError(errorText(reason));
        }
    }, [get]);
    const fetchAttention = useCallback(async () => {
        try {
            const page = await withController(signal => list({ statuses: ['blocked', 'in_review'], limit: 1 }, signal));
            setAttentionCount(page.counts.blocked + page.counts.inReview);
        }
        catch (reason) {
            setError(errorText(reason));
        }
    }, [list]);
    const fetchPage = useCallback(async (offset, append = false, silent = false) => {
        if (!silent)
            setBusy(true);
        setError(undefined);
        try {
            const page = await withController(signal => list({
                statuses: view === 'active'
                    ? ['pending', 'in_progress', 'blocked', 'in_review']
                    : view === 'completed' ? ['completed'] : TODO_STATUSES,
                archived: view === 'archived',
                ...(filters.search === '' ? {} : { search: filters.search }),
                ...(filters.tags.length === 0 ? {} : { tags: filters.tags }),
                offset,
            }, signal));
            setTodos(current => append ? [...current, ...page.todos] : page.todos.slice());
            setResult(page);
            setAttentionCount(page.counts.blocked + page.counts.inReview);
        }
        catch (reason) {
            setError(errorText(reason));
        }
        finally {
            if (!silent)
                setBusy(false);
        }
    }, [filters, list, view]);
    const refresh = useCallback(async (silent = false) => {
        await Promise.all([
            fetchPage(0, false, silent),
            selectedId === undefined ? Promise.resolve() : fetchDetail(selectedId),
        ]);
    }, [fetchDetail, fetchPage, selectedId]);
    useEffect(() => {
        if (!open)
            return;
        void fetchPage(0);
    }, [fetchPage, open]);
    useEffect(() => {
        void fetchAttention();
        const interval = window.setInterval(() => { void fetchAttention(); }, ACTIVE_REFRESH_MS);
        return () => { window.clearInterval(interval); };
    }, [fetchAttention]);
    useEffect(() => {
        if (!open || !todos.some(todo => todo.status === 'in_progress'))
            return;
        const interval = window.setInterval(() => { void refresh(true); }, ACTIVE_REFRESH_MS);
        return () => { window.clearInterval(interval); };
    }, [open, refresh, todos]);
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
        setSelectedId(undefined);
        setDetail(undefined);
        setOpen(false);
    };
    const activeCount = (result?.counts.pending ?? 0) + (result?.counts.inProgress ?? 0)
        + (result?.counts.blocked ?? 0) + (result?.counts.inReview ?? 0);
    const summary = t('count.summary', {
        active: activeCount,
        review: result?.counts.inReview ?? 0,
        completed: result?.counts.completed ?? 0,
        archived: result?.counts.archived ?? 0,
    });
    const formTitle = form?.id === undefined ? t('action.add') : t('action.edit');
    const statusLabel = (status) => {
        if (status === 'pending')
            return t('status.pending');
        if (status === 'in_progress')
            return t('status.inProgress');
        if (status === 'blocked')
            return t('status.blocked');
        if (status === 'in_review')
            return t('status.inReview');
        if (status === 'cancelled')
            return t('status.cancelled');
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
    const eventLabel = (type) => t(`event.${type}`);
    const sessionLabel = (session, sessions) => {
        if (session.role === 'primary')
            return t('session.primary');
        const index = sessions.filter(candidate => candidate.role === 'related').findIndex(candidate => candidate.sessionId === session.sessionId);
        return t('session.related', { index: index + 1 });
    };
    const mutate = async (operation, refreshSelected = true) => {
        setBusy(true);
        setError(undefined);
        try {
            await withController(operation);
            await fetchPage(0);
            if (refreshSelected && selectedId !== undefined)
                await fetchDetail(selectedId);
            return true;
        }
        catch (reason) {
            setError(errorText(reason));
            return false;
        }
        finally {
            setBusy(false);
        }
    };
    const selectTodo = (id) => {
        setSelectedId(id);
        setReplyText('');
        setFeedback('');
        void fetchDetail(id);
    };
    const saveForm = () => {
        if (form === undefined || form.title.trim() === '')
            return;
        const request = {
            title: form.title,
            notes: form.notes === '' ? null : form.notes,
            priority: form.priority,
            dueAt: dueAt(form.dueLocal),
            tags: tagsFromText(form.tags),
        };
        void mutate(async (signal) => {
            if (form.id !== undefined)
                return update({ id: form.id, patch: request }, signal);
            const created = await create(request, signal);
            return start(created.id, signal);
        }).then((saved) => {
            if (saved)
                setForm(undefined);
        });
    };
    const openConversation = (sessionId, parentSessionId) => {
        setBusy(true);
        setError(undefined);
        void openSession(sessionId, parentSessionId).then((opened) => {
            if (opened)
                close();
            else
                setError(t('state.sessionUnavailable'));
        }, (reason) => {
            setError(errorText(reason));
        }).finally(() => { setBusy(false); });
    };
    const emptyMessage = view === 'active'
        ? t('state.emptyActive')
        : view === 'completed' ? t('state.emptyCompleted') : t('state.emptyArchived');
    const visibleTodos = useMemo(() => todos, [todos]);
    const laneStatuses = useMemo(() => {
        if (view === 'active')
            return ACTIVE_STATUSES;
        if (view === 'completed')
            return ['completed'];
        return TODO_STATUSES.filter(status => todos.some(todo => todo.status === status));
    }, [todos, view]);
    const selectedRun = detail?.runs[0];
    const triggerLabel = attentionCount === 0
        ? t('trigger.aria')
        : t('trigger.attention', { count: attentionCount });
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: CSS }), _jsxs(Button, { className: "dsh-personal-todo-trigger", variant: "ghost", size: "sm", icon: _jsx(IconListPenOutline16, {}), "aria-label": triggerLabel, title: triggerLabel, "data-wide": wide, onClick: () => { setOpen(true); }, children: [wide ? _jsx("span", { children: t('trigger.label') }) : null, attentionCount > 0 && _jsx("span", { className: "dsh-personal-todo-attention", "aria-hidden": "true", children: attentionCount })] }), _jsxs(Modal, { open: open, onClose: close, title: t('panel.title'), closeLabel: t('panel.close'), description: t('panel.description'), className: "dsh-personal-todo-dialog", contentClassName: "dsh-personal-todo-body", children: [_jsxs("div", { className: "dsh-personal-todo-toolbar", children: [_jsxs("div", { className: "dsh-personal-todo-tabs", children: [_jsx("button", { type: "button", className: "dsh-personal-todo-tab", "data-active": view === 'active', onClick: () => { setView('active'); setSelectedId(undefined); setDetail(undefined); }, children: t('tab.active') }), _jsx("button", { type: "button", className: "dsh-personal-todo-tab", "data-active": view === 'completed', onClick: () => { setView('completed'); setSelectedId(undefined); setDetail(undefined); }, children: t('tab.completed') }), _jsx("button", { type: "button", className: "dsh-personal-todo-tab", "data-active": view === 'archived', onClick: () => { setView('archived'); setSelectedId(undefined); setDetail(undefined); }, children: t('tab.archived') })] }), _jsx(Button, { size: "sm", variant: "primary", icon: _jsx(IconPlusOutline16, {}), onClick: () => { setForm({ ...EMPTY_FORM }); }, children: t('action.add') }), _jsx(Button, { size: "sm", icon: _jsx(IconRefreshOutline16, {}), disabled: busy, onClick: () => { void refresh(); }, children: t('action.refresh') }), _jsx(Button, { size: "sm", variant: "outline", "aria-expanded": filtersOpen, onClick: () => { setFiltersOpen(current => !current); }, children: filtersOpen ? t('action.hideFilters') : t('action.filters') }), _jsx("span", { className: "dsh-personal-todo-count", children: summary })] }), filtersOpen && _jsxs("form", { className: "dsh-personal-todo-filters", onSubmit: (event) => {
                            event.preventDefault();
                            setFilters({ search: searchDraft.trim(), tags: tagsFromText(tagsDraft) });
                            setFiltersOpen(false);
                        }, children: [_jsx(Input, { value: searchDraft, onChange: event => { setSearchDraft(event.target.value); }, placeholder: t('search.placeholder'), "aria-label": t('search.aria') }), _jsx(Input, { value: tagsDraft, onChange: event => { setTagsDraft(event.target.value); }, placeholder: t('tags.placeholder'), "aria-label": t('tags.aria') }), _jsx(Button, { size: "sm", variant: "outline", type: "submit", children: t('action.apply') })] }), error !== undefined && _jsx("div", { className: "dsh-personal-todo-error", role: "alert", children: t('state.error', { message: error }) }), _jsxs("div", { className: "dsh-personal-todo-workspace", "data-has-selection": selectedId !== undefined, children: [_jsxs("div", { className: "dsh-personal-todo-list", children: [busy && todos.length === 0 && _jsx("div", { className: "dsh-personal-todo-empty", children: t('state.loading') }), !busy && visibleTodos.length === 0 && _jsx("div", { className: "dsh-personal-todo-empty", children: emptyMessage }), visibleTodos.length > 0 && _jsx("div", { className: "dsh-personal-todo-lanes", children: laneStatuses.map(status => {
                                            const laneTodos = visibleTodos.filter(todo => todo.status === status);
                                            return _jsxs("section", { className: "dsh-personal-todo-lane", children: [_jsxs("h3", { className: "dsh-personal-todo-lane-title", children: [statusLabel(status), " \u00B7 ", laneTodos.length] }), laneTodos.map(todo => (_jsxs("article", { className: "dsh-personal-todo-item", "data-selected": todo.id === selectedId, children: [_jsxs("button", { type: "button", className: "dsh-personal-todo-select", onClick: () => { selectTodo(todo.id); }, children: [_jsx("h3", { children: todo.title }), todo.latestSummary !== null && _jsx("p", { children: todo.latestSummary }), _jsxs("div", { className: "dsh-personal-todo-meta", children: [_jsx("span", { className: "dsh-personal-todo-badge", "data-status": todo.status, children: statusLabel(todo.status) }), _jsx("span", { className: "dsh-personal-todo-badge", "data-priority": todo.priority, children: priorityLabel(todo.priority) }), todo.tags.map(tag => _jsxs("span", { className: "dsh-personal-todo-badge", children: ["#", tag] }, tag))] })] }), _jsx("div", { className: "dsh-personal-todo-actions", children: todo.status === 'pending' && _jsx(Button, { size: "sm", variant: "primary", disabled: busy, onClick: () => { void mutate(signal => start(todo.id, signal)); }, children: t('action.start') }) })] }, todo.id)))] }, status);
                                        }) }), result?.hasMore === true && _jsx(Button, { className: "dsh-personal-todo-more", size: "sm", variant: "outline", disabled: busy, onClick: () => { void fetchPage(todos.length, true); }, children: t('action.loadMore') })] }), _jsxs("div", { className: "dsh-personal-todo-detail-pane", children: [_jsxs("section", { className: "dsh-personal-todo-detail", children: [selectedId === undefined && _jsx("div", { className: "dsh-personal-todo-empty", children: t('detail.empty') }), selectedId !== undefined && detail === undefined && _jsx("div", { className: "dsh-personal-todo-empty", children: t('state.loadingDetail') }), detail !== undefined && detail.todo.id === selectedId && _jsxs(_Fragment, { children: [_jsxs("div", { className: "dsh-personal-todo-detail-header", children: [_jsxs("div", { children: [_jsx(Button, { className: "dsh-personal-todo-back", size: "sm", variant: "outline", onClick: () => { setSelectedId(undefined); setDetail(undefined); }, children: t('action.back') }), _jsx("h2", { children: detail.todo.title }), _jsxs("div", { className: "dsh-personal-todo-meta", children: [_jsx("span", { className: "dsh-personal-todo-badge", "data-status": detail.todo.status, children: statusLabel(detail.todo.status) }), _jsx("span", { children: t('meta.reviewRound', { round: detail.todo.reviewRound }) })] })] }), _jsxs("div", { className: "dsh-personal-todo-detail-actions", children: [detail.todo.status === 'pending' && _jsx(Button, { variant: "primary", disabled: busy, onClick: () => { void mutate(signal => start(detail.todo.id, signal)); }, children: t('action.start') }), detail.todo.primarySessionId !== null && _jsx(Button, { variant: "outline", onClick: () => { openConversation(detail.todo.primarySessionId, null); }, children: t('action.openConversation') }), _jsx(Button, { variant: "outline", icon: _jsx(IconEditOutline16, {}), disabled: busy, onClick: () => { setForm(formOf(detail.todo)); }, children: t('action.edit') }), detail.todo.archivedAt === null && _jsx(Button, { variant: "outline", disabled: busy, onClick: () => {
                                                                            void mutate(signal => archive(detail.todo.id, signal), false).then((saved) => {
                                                                                if (saved) {
                                                                                    setSelectedId(undefined);
                                                                                    setDetail(undefined);
                                                                                }
                                                                            });
                                                                        }, children: t('action.archive') }), detail.todo.archivedAt !== null && _jsx(Button, { variant: "outline", disabled: busy, onClick: () => {
                                                                            void mutate(signal => restore(detail.todo.id, signal), false).then((saved) => {
                                                                                if (saved) {
                                                                                    setSelectedId(undefined);
                                                                                    setDetail(undefined);
                                                                                }
                                                                            });
                                                                        }, children: t('action.restore') }), (detail.todo.archivedAt !== null || detail.todo.status === 'pending' || detail.todo.status === 'completed' || detail.todo.status === 'cancelled') && _jsx(Button, { variant: "outline", icon: _jsx(IconTrashOutline16, {}), onClick: () => { setConfirming(detail.todo); }, children: t('action.delete') })] })] }), detail.todo.notes !== null && _jsx("p", { children: detail.todo.notes }), detail.todo.archivedAt !== null && _jsx("div", { className: "dsh-personal-todo-meta", children: _jsx("span", { children: t('meta.archived', { date: new Date(detail.todo.archivedAt).toLocaleString() }) }) }), detail.todo.blockedReason !== null && _jsxs("div", { className: "dsh-personal-todo-callout", children: [_jsx("strong", { children: t('detail.waitingForYou') }), _jsx("p", { children: detail.todo.blockedReason })] }), detail.todo.status === 'in_review' && selectedRun !== undefined && _jsxs("div", { className: "dsh-personal-todo-review", children: [_jsx("strong", { children: t('detail.review') }), _jsxs("dl", { children: [_jsx("dt", { children: t('review.summary') }), _jsx("dd", { children: selectedRun.resultSummary ?? '—' }), _jsx("dt", { children: t('review.verification') }), _jsx("dd", { children: selectedRun.verification ?? '—' }), _jsx("dt", { children: t('review.risk') }), _jsx("dd", { children: selectedRun.risk ?? '—' })] })] }), _jsx("h3", { children: t('detail.conversations') }), detail.sessions.length === 0 ? _jsx("p", { children: t('detail.noConversations') }) : detail.sessions.map(session => _jsxs("div", { className: "dsh-personal-todo-session", children: [_jsx("span", { children: sessionLabel(session, detail.sessions) }), _jsx(Button, { size: "sm", variant: "outline", onClick: () => { openConversation(session.sessionId, session.parentSessionId); }, children: t('action.openConversation') })] }, session.sessionId)), _jsx("h3", { children: t('detail.activity') }), _jsx("div", { className: "dsh-personal-todo-timeline", children: detail.events.map(event => _jsxs("div", { className: "dsh-personal-todo-event", children: [_jsx("span", { children: "\u2022" }), _jsxs("span", { children: [_jsx("strong", { children: eventLabel(event.type) }), event.message === null ? null : _jsxs(_Fragment, { children: [" \u00B7 ", event.message] })] }), _jsx("time", { children: new Date(event.createdAt).toLocaleString() })] }, event.id)) })] })] }), detail !== undefined && detail.todo.id === selectedId && detail.todo.status === 'blocked' && _jsxs("div", { className: "dsh-personal-todo-commandbar", children: [_jsx("textarea", { "aria-label": t('reply.aria'), value: replyText, onChange: event => { setReplyText(event.target.value); }, placeholder: t('reply.placeholder') }), _jsx("div", { className: "dsh-personal-todo-commandbar-actions", children: _jsx(Button, { variant: "primary", disabled: busy || replyText.trim() === '', onClick: () => { void mutate(signal => reply({ id: detail.todo.id, message: replyText }, signal)).then(saved => { if (saved)
                                                        setReplyText(''); }); }, children: t('action.reply') }) })] }), detail !== undefined && detail.todo.id === selectedId && detail.todo.status === 'in_review' && _jsxs("div", { className: "dsh-personal-todo-commandbar", children: [_jsx("textarea", { "aria-label": t('feedback.aria'), value: feedback, onChange: event => { setFeedback(event.target.value); }, placeholder: t('feedback.placeholder') }), _jsxs("div", { className: "dsh-personal-todo-commandbar-actions", children: [_jsx(Button, { variant: "outline", disabled: busy || feedback.trim() === '', onClick: () => { void mutate(signal => requestChanges({ id: detail.todo.id, feedback }, signal)).then(saved => { if (saved)
                                                            setFeedback(''); }); }, children: t('action.requestChanges') }), _jsx(Button, { variant: "primary", disabled: busy, onClick: () => { void mutate(signal => approve(detail.todo.id, signal)); }, children: t('action.approve') })] })] })] })] })] }), _jsx(Modal, { open: form !== undefined, onClose: () => { setForm(undefined); }, title: formTitle, closeLabel: t('action.cancel'), className: "dsh-personal-todo-small-dialog", children: form !== undefined && _jsxs("div", { className: "dsh-personal-todo-form", children: [_jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.title'), _jsx(Input, { autoFocus: true, value: form.title, maxLength: 200, placeholder: t('field.titlePlaceholder'), onChange: event => { setForm({ ...form, title: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.notes'), _jsx("textarea", { value: form.notes, maxLength: 10_000, placeholder: t('field.notesPlaceholder'), onChange: event => { setForm({ ...form, notes: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", children: [t('field.priority'), _jsxs("select", { value: form.priority, onChange: event => { setForm({ ...form, priority: event.target.value }); }, children: [_jsx("option", { value: "none", children: t('priority.none') }), _jsx("option", { value: "low", children: t('priority.low') }), _jsx("option", { value: "medium", children: t('priority.medium') }), _jsx("option", { value: "high", children: t('priority.high') })] })] }), _jsxs("label", { className: "dsh-personal-todo-field", children: [t('field.dueAt'), _jsx(Input, { type: "datetime-local", value: form.dueLocal, onChange: event => { setForm({ ...form, dueLocal: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.tags'), _jsx(Input, { value: form.tags, placeholder: t('field.tagsPlaceholder'), onChange: event => { setForm({ ...form, tags: event.target.value }); } })] }), _jsxs("div", { className: "dsh-personal-todo-form-actions", children: [_jsx(Button, { variant: "outline", onClick: () => { setForm(undefined); }, children: t('action.cancel') }), _jsx(Button, { variant: "primary", disabled: busy || form.title.trim() === '', onClick: saveForm, children: form.id === undefined ? t('action.create') : t('action.save') })] })] }) }), _jsx(Modal, { open: confirming !== undefined, onClose: () => { setConfirming(undefined); }, title: t('delete.title'), closeLabel: t('delete.close'), description: confirming === undefined ? '' : t('delete.description', { title: confirming.title }), className: "dsh-personal-todo-small-dialog", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: () => { setConfirming(undefined); }, children: t('action.cancel') }), _jsx(Button, { variant: "primary", disabled: busy, onClick: () => {
                                if (confirming === undefined)
                                    return;
                                const id = confirming.id;
                                void mutate(signal => deleteTodo(id, signal), false).then((deleted) => {
                                    if (deleted) {
                                        setConfirming(undefined);
                                        setSelectedId(undefined);
                                        setDetail(undefined);
                                    }
                                });
                            }, children: t('action.delete') })] }) })] }));
}
//# sourceMappingURL=PersonalTodoPanel.js.map
