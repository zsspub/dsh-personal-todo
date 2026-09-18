import React, {
  useEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Menu, Modal, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  Archive, ArrowDown, CalendarDays, ChevronsUp, CircleCheck, CircleDot,
  CircleX, Ellipsis, Equal, ListTodo, MessageSquare, Pencil, Play, RefreshCw,
  Tag, Trash2, Undo2, UserRound,
} from 'lucide-react'
import type { ListTodoInput, Todo, TodoListResult, TodoPriority } from '../types.ts'
import { isPersonalTodoPresentationMeta } from '../presentation.ts'
import type { PersonalTodoDataCenter, TodoQuerySnapshot } from './data-center.ts'
import { NS } from './locales.ts'
import { requiresAgentStop, todoActionState, type TodoLifecycleAction } from './todo-actions.ts'

const EMPTY_QUERY: TodoQuerySnapshot = {
  ids: [],
  total: 0,
  counts: { pending: 0, inProgress: 0, completed: 0, cancelled: 0, archived: 0 },
  hasMore: false,
  loading: false,
  refreshing: false,
  error: undefined,
  updatedAt: undefined,
}

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
`

interface TodoToolCardInjected {
  readonly dataCenter: PersonalTodoDataCenter
  readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>
}

export type TodoToolCardProps =
  Pick<ToolCallViewProps, 'block'> & PropsLocale<typeof NS> & TodoToolCardInjected

interface CardModel {
  readonly query: ListTodoInput | undefined
  readonly snapshot: TodoListResult | undefined
}

interface EditForm {
  readonly id: string
  readonly title: string
  readonly notes: string
  readonly assignee: string
  readonly priority: TodoPriority
  readonly dueLocal: string
  readonly tags: string
}

interface Confirmation {
  readonly todo: Todo
  readonly label: string
  readonly action: TodoLifecycleAction
  readonly run: (signal: AbortSignal) => Promise<unknown>
}

function parseObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

function parseQuery(value: string): ListTodoInput | undefined {
  const parsed = parseObject(value)
  if (parsed === undefined) return undefined
  return parsed as ListTodoInput
}

function parseSnapshot(value: unknown): TodoListResult | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const result = value as Partial<TodoListResult>
  if (!Array.isArray(result.todos)
    || typeof result.total !== 'number'
    || typeof result.hasMore !== 'boolean'
    || result.counts === null
    || typeof result.counts !== 'object') return undefined
  return result as TodoListResult
}

function textContent(content: readonly unknown[]): string | undefined {
  const text = content.find(block => block !== null && typeof block === 'object'
    && (block as { type?: unknown }).type === 'text'
    && typeof (block as { text?: unknown }).text === 'string') as { text: string } | undefined
  return text?.text
}

function modelOf(block: ToolCallViewProps['block']): CardModel {
  if (!('kind' in block)) return { query: parseQuery(block.argsRaw), snapshot: undefined }
  if (isPersonalTodoPresentationMeta(block.meta)) {
    return { query: block.meta.query, snapshot: block.meta.snapshot }
  }
  const raw = textContent(block.content)
  return {
    query: block.call === null ? undefined : parseQuery(block.call.argsRaw),
    snapshot: raw === undefined ? undefined : parseSnapshot(parseObject(raw)),
  }
}

function dueLocal(value: string | null): string {
  if (value === null) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function formOf(todo: Todo): EditForm {
  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes ?? '',
    assignee: todo.assignee ?? '',
    priority: todo.priority,
    dueLocal: dueLocal(todo.dueAt),
    tags: todo.tags.join(', '),
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 渲染展示工具及历史列表工具的实时待办卡片。 */
export function TodoToolCard({
  block, dataCenter, openSession, t,
}: TodoToolCardProps) {
  const model = useMemo(() => modelOf(block), [block])
  const query = useMemo(() => {
    if (model.query === undefined) return undefined
    const handle = dataCenter.query(model.query, 'all')
    if (model.snapshot !== undefined) handle.seed(model.snapshot)
    return handle
  }, [dataCenter, model])
  const snapshot = useSyncExternalStore(
    query?.subscribe ?? (() => () => undefined),
    query?.getSnapshot ?? (() => EMPTY_QUERY),
  )
  const entities = useSyncExternalStore(
    listener => dataCenter.entities.listen(listener),
    dataCenter.entities.get,
  )
  const mutations = useSyncExternalStore(
    listener => dataCenter.mutations.listen(listener),
    dataCenter.mutations.get,
  )
  const deletedIds = useSyncExternalStore(
    listener => dataCenter.deletedIds.listen(listener),
    dataCenter.deletedIds.get,
  )
  const [menuId, setMenuId] = useState<string>()
  const [editForm, setEditForm] = useState<EditForm>()
  const [confirmation, setConfirmation] = useState<Confirmation>()
  const [deleting, setDeleting] = useState<Todo>()
  const [error, setError] = useState<string>()
  const controllers = useRef(new Set<AbortController>())
  const fallbackTodos = useMemo(() => model.snapshot?.todos ?? [], [model.snapshot])
  const fallbackById = useMemo(
    () => Object.fromEntries(fallbackTodos.map(todo => [todo.id, todo])),
    [fallbackTodos],
  )
  const ids = (query === undefined ? fallbackTodos.map(todo => todo.id) : snapshot.ids)
    .filter(id => deletedIds[id] === undefined)
  const todos = ids.flatMap(id => entities[id] ?? fallbackById[id] ?? [])
  const removedFallbackCount = fallbackTodos.reduce(
    (count, todo) => count + (deletedIds[todo.id] === undefined ? 0 : 1),
    0,
  )
  const storedTotal = query === undefined
    ? Math.max(0, (model.snapshot?.total ?? todos.length) - removedFallbackCount)
    : snapshot.total
  const queryError = query === undefined ? undefined : snapshot.error
  const isRunning = !('kind' in block)
  const toolError = 'kind' in block && block.isError
    ? block.error === undefined ? t('card.toolError') : `${block.error.name} (${block.error.code})`
    : undefined
  const visibleTodos = isRunning || toolError !== undefined ? [] : todos
  const total = isRunning || toolError !== undefined ? 0 : storedTotal

  useEffect(() => {
    dataCenter.seedTodos(fallbackTodos)
  }, [dataCenter, fallbackTodos])

  useEffect(() => {
    if (query === undefined || !('kind' in block) || block.isError) return
    void query.refresh().catch(() => undefined)
  }, [block, query])

  useEffect(() => () => {
    for (const controller of controllers.current) controller.abort()
    controllers.current.clear()
  }, [])

  const run = async (operation: (signal: AbortSignal) => Promise<unknown>): Promise<boolean> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    setError(undefined)
    try {
      await operation(controller.signal)
      return true
    } catch (reason) {
      setError(errorText(reason))
      return false
    } finally {
      controllers.current.delete(controller)
    }
  }

  const lifecycle = (
    todo: Todo,
    label: string,
    action: TodoLifecycleAction,
    operation: (signal: AbortSignal) => Promise<unknown>,
  ): void => {
    if (requiresAgentStop(todo, action)) setConfirmation({ todo, label, action, run: operation })
    else void run(operation)
  }

  const saveEdit = (): void => {
    if (editForm === undefined || editForm.title.trim() === '') return
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
    }, signal)).then(saved => { if (saved) setEditForm(undefined) })
  }

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
      ].filter(Boolean).join(' · ') || t('card.filterDefault')

  return (
    <>
      <style>{CSS}</style>
      <section className="dsh-personal-todo-tool" aria-label={t('card.title')}>
        <header className="dsh-personal-todo-tool-header">
          <div className="dsh-personal-todo-tool-title">
            <ListTodo size={18} aria-hidden="true" />
            <div><h3>{t('card.title')}</h3><p>{filterLabel}</p></div>
          </div>
          <div className="dsh-personal-todo-tool-header-actions">
            <Button size="sm" variant="ghost" icon={<RefreshCw size={14} aria-hidden="true" />}
              disabled={query === undefined || snapshot.loading || snapshot.refreshing}
              aria-label={t('card.refresh')} onClick={() => { void query?.refresh().catch(() => undefined) }}>
              {snapshot.refreshing ? t('card.refreshing') : t('card.refresh')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { dataCenter.openTodo() }}>{t('card.openPanel')}</Button>
          </div>
        </header>
        {error !== undefined && <div className="dsh-personal-todo-tool-error" role="alert">{error}</div>}
        {queryError !== undefined && <div className="dsh-personal-todo-tool-error" role="alert">{t('card.refreshError', { message: queryError })}</div>}
        {toolError !== undefined && <div className="dsh-personal-todo-tool-error" role="alert">{toolError}</div>}
        {isRunning && <div className="dsh-personal-todo-tool-state">{t('state.loading')}</div>}
        {!isRunning && toolError === undefined && !snapshot.loading && visibleTodos.length === 0 && <div className="dsh-personal-todo-tool-state">{t('card.empty')}</div>}
        {visibleTodos.length > 0 && <div className="dsh-personal-todo-tool-list">
          {visibleTodos.map(todo => {
            const state = todoActionState(todo)
            const mutating = mutations[todo.id] !== undefined
            const statusLabel = todo.status === 'in_progress' ? t('status.inProgress') : t(`status.${todo.status}`)
            const priorityLabel = t(`priority.${todo.priority}`)
            const entries: MenuEntry[] = []
            if (todo.status === 'pending') entries.push({ id: 'manualStart', label: t('action.manualStart') })
            if (todo.status === 'in_progress') entries.push({ id: 'pending', label: t('action.pending') })
            if (state.canReopen) entries.push({ id: 'reopen', label: t('action.reopen') })
            if (state.canStart) entries.push({ id: 'start', label: t('action.start'), icon: <Play size={14} /> })
            if (state.running) entries.push({ id: 'stop', label: t('action.takeOver'), icon: <CircleX size={14} /> })
            entries.push({ id: 'edit', label: t('action.edit'), icon: <Pencil size={14} /> })
            if (state.canArchive) entries.push({ id: 'archive', label: t('action.archive'), icon: <Archive size={14} /> })
            if (state.canRestore) entries.push({ id: 'restore', label: t('action.restore'), icon: <Undo2 size={14} /> })
            if (state.canCancel) entries.push({ id: 'cancel', label: t('action.cancelTask'), icon: <CircleX size={14} /> })
            if (state.canDelete) entries.push({ id: 'delete', label: t('action.delete'), icon: <Trash2 size={14} />, danger: true })
            const select = (action: string): void => {
              setMenuId(undefined)
              if (mutating) return
              if (action === 'manualStart') void run(signal => dataCenter.setStatus({ id: todo.id, status: 'in_progress' }, signal))
              if (action === 'pending') lifecycle(todo, t('action.pending'), 'pending', signal => dataCenter.setStatus({ id: todo.id, status: 'pending' }, signal))
              if (action === 'reopen') void run(signal => dataCenter.setStatus({ id: todo.id, status: 'pending' }, signal))
              if (action === 'start') void run(signal => dataCenter.start(todo.id, signal))
              if (action === 'stop') lifecycle(todo, t('action.takeOver'), 'stop', signal => dataCenter.stop(todo.id, signal))
              if (action === 'edit') setEditForm(formOf(todo))
              if (action === 'archive') lifecycle(todo, t('action.archive'), 'archive', signal => dataCenter.archive(todo.id, signal))
              if (action === 'restore') void run(signal => dataCenter.restore(todo.id, signal))
              if (action === 'cancel') lifecycle(todo, t('action.cancelTask'), 'cancel', signal => dataCenter.setStatus({ id: todo.id, status: 'cancelled' }, signal))
              if (action === 'delete') setDeleting(todo)
            }
            return <article className="dsh-personal-todo-tool-item" key={todo.id}>
              <div className="dsh-personal-todo-tool-item-heading">
                <h4>{todo.title}</h4>
                <span className="dsh-personal-todo-tool-badge"><CircleDot size={12} aria-hidden="true" /><span>{statusLabel}</span></span>
              </div>
              {todo.notes !== null && <p className="dsh-personal-todo-tool-notes">{todo.notes}</p>}
              <div className="dsh-personal-todo-tool-meta">
                {todo.executionStatus !== null && <span className="dsh-personal-todo-tool-badge"><span>{t(`execution.${todo.executionStatus}`)}</span></span>}
                <span className="dsh-personal-todo-tool-badge"><UserRound size={12} aria-hidden="true" /><span>{todo.assignee ?? t('assignee.unassigned')}</span></span>
                {todo.priority !== 'none' && <span className="dsh-personal-todo-tool-badge" data-priority={todo.priority}>
                  {todo.priority === 'high' ? <ChevronsUp size={12} /> : todo.priority === 'medium' ? <Equal size={12} /> : <ArrowDown size={12} />}<span>{priorityLabel}</span>
                </span>}
                {todo.dueAt !== null && <span className="dsh-personal-todo-tool-badge"><CalendarDays size={12} aria-hidden="true" /><span>{new Date(todo.dueAt).toLocaleString()}</span></span>}
                {todo.tags.map(tag => <span className="dsh-personal-todo-tool-badge" key={tag}><Tag size={12} aria-hidden="true" /><span>{tag}</span></span>)}
              </div>
              <div className="dsh-personal-todo-tool-actions">
                <Button size="sm" variant="outline" disabled={mutating} onClick={() => { dataCenter.openTodo(todo.id) }}>{t('card.viewDetail')}</Button>
                {state.canComplete && <Button size="sm" variant="primary" icon={<CircleCheck size={14} aria-hidden="true" />} disabled={mutating}
                  onClick={() => { lifecycle(todo, t('action.complete'), 'complete', signal => dataCenter.approve(todo.id, signal)) }}>{t('action.complete')}</Button>}
                {state.canOpenConversation && <Button size="sm" variant="ghost" icon={<MessageSquare size={14} aria-hidden="true" />} disabled={mutating}
                  onClick={() => { void run(async () => {
                    const opened = await openSession(todo.primarySessionId as string, null)
                    if (!opened) throw new Error(t('state.sessionUnavailable'))
                  }) }}>{t('action.openConversation')}</Button>}
                <Menu open={menuId === todo.id} onClose={() => { setMenuId(undefined) }} items={entries.map(entry => 'type' in entry ? entry : { ...entry, disabled: mutating })}
                  onSelect={select} align="end" portal dense
                  anchor={<Button size="sm" variant="ghost" icon={<Ellipsis size={14} aria-hidden="true" />} disabled={mutating}
                    aria-label={t('action.moreActions')} aria-haspopup="menu" aria-expanded={menuId === todo.id}
                    onClick={() => { setMenuId(current => current === todo.id ? undefined : todo.id) }}>{t('action.more')}</Button>} />
              </div>
            </article>
          })}
        </div>}
        <footer className="dsh-personal-todo-tool-footer">
          <span>{t('card.total', { count: total })}</span>
          <span>{snapshot.refreshing
            ? t('card.refreshing')
            : query === undefined || snapshot.updatedAt === undefined
              ? t('card.snapshot')
              : t('card.live')}</span>
        </footer>
      </section>
      <Modal open={editForm !== undefined} onClose={() => { setEditForm(undefined) }} title={t('action.edit')} closeLabel={t('action.cancel')}
        footer={<><Button variant="outline" onClick={() => { setEditForm(undefined) }}>{t('action.cancel')}</Button><Button variant="primary" disabled={editForm?.title.trim() === ''} onClick={saveEdit}>{t('action.save')}</Button></>}>
        {editForm !== undefined && <div className="dsh-personal-todo-tool-form">
          <label className="dsh-personal-todo-tool-field" data-wide="true">{t('field.title')}<input value={editForm.title} maxLength={200} onChange={event => { setEditForm({ ...editForm, title: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-tool-field" data-wide="true">{t('field.notes')}<textarea value={editForm.notes} maxLength={10_000} onChange={event => { setEditForm({ ...editForm, notes: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-tool-field">{t('field.assignee')}<input value={editForm.assignee} maxLength={100} onChange={event => { setEditForm({ ...editForm, assignee: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-tool-field">{t('field.priority')}<select value={editForm.priority} onChange={event => { setEditForm({ ...editForm, priority: event.target.value as TodoPriority }) }}><option value="none">{t('priority.none')}</option><option value="low">{t('priority.low')}</option><option value="medium">{t('priority.medium')}</option><option value="high">{t('priority.high')}</option></select></label>
          <label className="dsh-personal-todo-tool-field" data-wide="true">{t('field.dueAt')}<input type="datetime-local" value={editForm.dueLocal} onChange={event => { setEditForm({ ...editForm, dueLocal: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-tool-field" data-wide="true">{t('field.tags')}<input value={editForm.tags} onChange={event => { setEditForm({ ...editForm, tags: event.target.value }) }} /></label>
        </div>}
      </Modal>
      <Modal open={confirmation !== undefined} onClose={() => { setConfirmation(undefined) }}
        title={t('execution.stopTitle')} closeLabel={t('execution.stopClose')}
        description={t('execution.stopDescription', { action: confirmation?.label ?? '' })}
        footer={<><Button variant="outline" onClick={() => { setConfirmation(undefined) }}>{t('action.cancel')}</Button><Button variant="primary" onClick={() => {
          if (confirmation === undefined) return
          void run(confirmation.run).then(saved => { if (saved) setConfirmation(undefined) })
        }}>{t('execution.stopConfirm')}</Button></>} />
      <Modal open={deleting !== undefined} onClose={() => { setDeleting(undefined) }}
        title={t('delete.title')} closeLabel={t('delete.close')}
        description={deleting === undefined ? '' : t('delete.description', { title: deleting.title })}
        footer={<><Button variant="outline" onClick={() => { setDeleting(undefined) }}>{t('action.cancel')}</Button><Button variant="primary" onClick={() => {
          if (deleting === undefined) return
          void run(signal => dataCenter.delete(deleting.id, signal)).then(saved => { if (saved) setDeleting(undefined) })
        }}>{t('action.delete')}</Button></>} />
    </>
  )
}
