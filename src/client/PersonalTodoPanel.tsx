import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconCheckOutline16, IconEditOutline16, IconListPenOutline16, IconPlusOutline16,
  IconRefreshOutline16, IconTrashOutline16, Input, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CreateTodoInput, DeleteTodoResult, ListTodoInput, Todo, TodoListResult, TodoPriority,
  TodoStatus, UpdateTodoRequest,
} from '../types.ts'
import type { NS } from './locales.ts'

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
`

export interface PersonalTodoPanelInjected {
  readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>
  readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>
  readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>
  readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>
}

export type PersonalTodoPanelProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected

type View = 'active' | 'completed'

interface FormState {
  readonly id?: string
  readonly title: string
  readonly notes: string
  readonly status: TodoStatus
  readonly priority: TodoPriority
  readonly dueLocal: string
  readonly tags: string
}

const EMPTY_FORM: FormState = {
  title: '',
  notes: '',
  status: 'pending',
  priority: 'none',
  dueLocal: '',
  tags: '',
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function tagsFromText(value: string): string[] {
  return value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
}

function localDateTime(value: string | null): string {
  if (value === null) return ''
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function formOf(todo: Todo): FormState {
  return {
    id: todo.id,
    title: todo.title,
    notes: todo.notes ?? '',
    status: todo.status,
    priority: todo.priority,
    dueLocal: localDateTime(todo.dueAt),
    tags: todo.tags.join(', '),
  }
}

function dueAt(value: string): string | null {
  return value === '' ? null : new Date(value).toISOString()
}

/** Sidebar action and modal manager for the shared personal todo database. */
export function PersonalTodoPanel({ wide, t, list, create, update, delete: deleteTodo }: PersonalTodoPanelProps) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('active')
  const [todos, setTodos] = useState<Todo[]>([])
  const [result, setResult] = useState<TodoListResult>()
  const [searchDraft, setSearchDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [filters, setFilters] = useState({ search: '', tags: [] as string[] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [form, setForm] = useState<FormState>()
  const [confirming, setConfirming] = useState<Todo>()
  const controllers = useRef(new Set<AbortController>())

  const fetchPage = useCallback(async (offset: number, append = false): Promise<void> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    setBusy(true)
    setError(undefined)
    try {
      const page = await list({
        statuses: view === 'active' ? ['pending', 'in_progress'] : ['completed'],
        ...(filters.search === '' ? {} : { search: filters.search }),
        ...(filters.tags.length === 0 ? {} : { tags: filters.tags }),
        offset,
      }, controller.signal)
      setTodos(current => append ? [...current, ...page.todos] : page.todos.slice())
      setResult(page)
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorText(reason))
    } finally {
      controllers.current.delete(controller)
      setBusy(false)
    }
  }, [filters, list, view])

  useEffect(() => {
    if (!open) return
    void fetchPage(0)
  }, [fetchPage, open])

  useEffect(() => () => {
    for (const controller of controllers.current) controller.abort()
    controllers.current.clear()
  }, [])

  const close = (): void => {
    for (const controller of controllers.current) controller.abort()
    controllers.current.clear()
    setBusy(false)
    setForm(undefined)
    setConfirming(undefined)
    setOpen(false)
  }

  const activeCount = (result?.counts.pending ?? 0) + (result?.counts.inProgress ?? 0)
  const summary = t('count.summary', { active: activeCount, completed: result?.counts.completed ?? 0 })
  const formTitle = form?.id === undefined ? t('action.add') : t('action.edit')

  const statusLabel = (status: TodoStatus): string => {
    if (status === 'pending') return t('status.pending')
    if (status === 'in_progress') return t('status.inProgress')
    return t('status.completed')
  }
  const priorityLabel = (priority: TodoPriority): string => {
    if (priority === 'none') return t('priority.none')
    if (priority === 'low') return t('priority.low')
    if (priority === 'medium') return t('priority.medium')
    return t('priority.high')
  }

  const mutate = async (operation: (signal: AbortSignal) => Promise<unknown>): Promise<boolean> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    setBusy(true)
    setError(undefined)
    try {
      await operation(controller.signal)
      await fetchPage(0)
      return true
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorText(reason))
      return false
    } finally {
      controllers.current.delete(controller)
      setBusy(false)
    }
  }

  const saveForm = (): void => {
    if (form === undefined || form.title.trim() === '') return
    const request: CreateTodoInput = {
      title: form.title,
      notes: form.notes === '' ? null : form.notes,
      status: form.status,
      priority: form.priority,
      dueAt: dueAt(form.dueLocal),
      tags: tagsFromText(form.tags),
    }
    void mutate(signal => form.id === undefined
      ? create(request, signal)
      : update({ id: form.id, patch: request }, signal)).then((saved) => {
        if (saved) setForm(undefined)
      })
  }

  const emptyMessage = view === 'active' ? t('state.emptyActive') : t('state.emptyCompleted')
  const visibleTodos = useMemo(() => todos, [todos])

  return (
    <>
      <style>{CSS}</style>
      <Button
        className="dsh-personal-todo-trigger"
        variant="ghost"
        size="sm"
        icon={<IconListPenOutline16 />}
        aria-label={t('trigger.aria')}
        title={t('trigger.aria')}
        onClick={() => { setOpen(true) }}
      >
        {wide ? t('trigger.label') : null}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title={t('panel.title')}
        closeLabel={t('panel.close')}
        description={t('panel.description')}
        className="dsh-personal-todo-dialog"
        contentClassName="dsh-personal-todo-body"
      >
        <div className="dsh-personal-todo-toolbar">
          <div className="dsh-personal-todo-tabs">
            <button type="button" className="dsh-personal-todo-tab" data-active={view === 'active'} onClick={() => { setView('active') }}>{t('tab.active')}</button>
            <button type="button" className="dsh-personal-todo-tab" data-active={view === 'completed'} onClick={() => { setView('completed') }}>{t('tab.completed')}</button>
          </div>
          <Button size="sm" variant="primary" icon={<IconPlusOutline16 />} onClick={() => { setForm({ ...EMPTY_FORM }) }}>{t('action.add')}</Button>
          <Button size="sm" icon={<IconRefreshOutline16 />} disabled={busy} onClick={() => { void fetchPage(0) }}>{t('action.refresh')}</Button>
          <span className="dsh-personal-todo-count">{summary}</span>
        </div>
        <form className="dsh-personal-todo-filters" onSubmit={(event) => {
          event.preventDefault()
          setFilters({ search: searchDraft.trim(), tags: tagsFromText(tagsDraft) })
        }}>
          <Input value={searchDraft} onChange={event => { setSearchDraft(event.target.value) }} placeholder={t('search.placeholder')} aria-label={t('search.aria')} />
          <Input value={tagsDraft} onChange={event => { setTagsDraft(event.target.value) }} placeholder={t('tags.placeholder')} aria-label={t('tags.aria')} />
          <Button size="sm" variant="outline" type="submit">{t('action.apply')}</Button>
        </form>
        {error !== undefined && <div className="dsh-personal-todo-error" role="alert">{t('state.error', { message: error })}</div>}
        <div className="dsh-personal-todo-list">
          {busy && todos.length === 0 && <div className="dsh-personal-todo-empty">{t('state.loading')}</div>}
          {!busy && visibleTodos.length === 0 && <div className="dsh-personal-todo-empty">{emptyMessage}</div>}
          {visibleTodos.map(todo => (
            <article className="dsh-personal-todo-item" key={todo.id}>
              <div>
                <h3>{todo.title}</h3>
                {todo.notes !== null && <p>{todo.notes}</p>}
                <div className="dsh-personal-todo-meta">
                  <span className="dsh-personal-todo-badge">{statusLabel(todo.status)}</span>
                  <span className="dsh-personal-todo-badge" data-priority={todo.priority}>{priorityLabel(todo.priority)}</span>
                  {todo.tags.map(tag => <span className="dsh-personal-todo-badge" key={tag}>#{tag}</span>)}
                  {todo.dueAt !== null && <span>{t('meta.due', { date: new Date(todo.dueAt).toLocaleString() })}</span>}
                  {todo.completedAt !== null && <span>{t('meta.completed', { date: new Date(todo.completedAt).toLocaleString() })}</span>}
                </div>
              </div>
              <div className="dsh-personal-todo-actions">
                <Button size="sm" icon={<IconEditOutline16 />} disabled={busy} onClick={() => { setForm(formOf(todo)) }}>{t('action.edit')}</Button>
                <Button size="sm" icon={<IconCheckOutline16 />} disabled={busy} onClick={() => {
                  void mutate(signal => update({ id: todo.id, patch: { status: todo.status === 'completed' ? 'pending' : 'completed' } }, signal))
                }}>{todo.status === 'completed' ? t('action.reopen') : t('action.complete')}</Button>
                <Button size="sm" icon={<IconTrashOutline16 />} disabled={busy} onClick={() => { setConfirming(todo) }}>{t('action.delete')}</Button>
              </div>
            </article>
          ))}
          {result?.hasMore === true && <Button className="dsh-personal-todo-more" size="sm" variant="outline" disabled={busy} onClick={() => { void fetchPage(todos.length, true) }}>{t('action.loadMore')}</Button>}
        </div>
      </Modal>
      <Modal
        open={form !== undefined}
        onClose={() => { setForm(undefined) }}
        title={formTitle}
        closeLabel={t('action.cancel')}
        className="dsh-personal-todo-delete-dialog"
      >
        {form !== undefined && <div className="dsh-personal-todo-form">
          <label className="dsh-personal-todo-field" data-wide="true">{t('field.title')}<Input autoFocus value={form.title} maxLength={200} placeholder={t('field.titlePlaceholder')} onChange={event => { setForm({ ...form, title: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-field" data-wide="true">{t('field.notes')}<textarea value={form.notes} maxLength={10_000} placeholder={t('field.notesPlaceholder')} onChange={event => { setForm({ ...form, notes: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-field">{t('field.status')}<select value={form.status} onChange={event => { setForm({ ...form, status: event.target.value as TodoStatus }) }}><option value="pending">{t('status.pending')}</option><option value="in_progress">{t('status.inProgress')}</option><option value="completed">{t('status.completed')}</option></select></label>
          <label className="dsh-personal-todo-field">{t('field.priority')}<select value={form.priority} onChange={event => { setForm({ ...form, priority: event.target.value as TodoPriority }) }}><option value="none">{t('priority.none')}</option><option value="low">{t('priority.low')}</option><option value="medium">{t('priority.medium')}</option><option value="high">{t('priority.high')}</option></select></label>
          <label className="dsh-personal-todo-field">{t('field.dueAt')}<Input type="datetime-local" value={form.dueLocal} onChange={event => { setForm({ ...form, dueLocal: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-field">{t('field.tags')}<Input value={form.tags} placeholder={t('field.tagsPlaceholder')} onChange={event => { setForm({ ...form, tags: event.target.value }) }} /></label>
          <div className="dsh-personal-todo-form-actions"><Button variant="outline" onClick={() => { setForm(undefined) }}>{t('action.cancel')}</Button><Button variant="primary" disabled={busy || form.title.trim() === ''} onClick={saveForm}>{form.id === undefined ? t('action.create') : t('action.save')}</Button></div>
        </div>}
      </Modal>
      <Modal
        open={confirming !== undefined}
        onClose={() => { setConfirming(undefined) }}
        title={t('delete.title')}
        closeLabel={t('delete.close')}
        description={confirming === undefined ? '' : t('delete.description', { title: confirming.title })}
        className="dsh-personal-todo-delete-dialog"
        footer={<><Button variant="outline" onClick={() => { setConfirming(undefined) }}>{t('action.cancel')}</Button><Button variant="primary" disabled={busy} onClick={() => {
          if (confirming === undefined) return
          const id = confirming.id
          void mutate(signal => deleteTodo(id, signal)).then((deleted) => {
            if (deleted) setConfirming(undefined)
          })
        }}>{t('action.delete')}</Button></>}
      />
    </>
  )
}
