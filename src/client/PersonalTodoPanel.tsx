import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconEditOutline16, IconListPenOutline16, IconPlusOutline16,
  IconRefreshOutline16, IconTrashOutline16, Input, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CreateTodoInput, DeleteTodoResult, ListTodoInput, ReplyTodoRequest,
  RequestTodoChangesRequest, Todo, TodoDetail, TodoEventType, TodoListResult,
  TodoPriority, TodoSession, TodoStatus, UpdateTodoRequest,
} from '../types.ts'
import type { NS } from './locales.ts'

// The slot renderer anchors list slots with inline `display: contents`. A wide
// sidebar reifies that wrapper so every footer action occupies its own row.
const CSS = `
.dsh-personal-todo-trigger{min-width:28px}
[data-slot='sidebar.footer.action']:has(.dsh-personal-todo-trigger[data-wide=true]){display:flex!important;flex:1;flex-direction:column;min-width:0;width:100%}
.dsh-personal-todo-trigger[data-wide=true]{justify-content:flex-start;width:100%}
.dsh-personal-todo-dialog{width:min(1180px,calc(100vw - 32px));max-width:none;height:min(820px,calc(100vh - 32px))}
.dsh-personal-todo-body{display:flex;flex-direction:column;min-height:0;height:100%;gap:12px}
.dsh-personal-todo-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dsh-personal-todo-tabs{display:flex;gap:4px;padding:3px;border-radius:16px;background:var(--dsw-alias-bg-layer-3)}
.dsh-personal-todo-tab{border:0;border-radius:13px;padding:5px 12px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-personal-todo-tab[data-active=true]{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dsh-personal-todo-count{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-personal-todo-filters{display:grid;grid-template-columns:minmax(160px,1fr) minmax(160px,1fr) auto;gap:8px}
.dsh-personal-todo-workspace{display:grid;grid-template-columns:minmax(300px,360px) minmax(0,1fr);flex:1;min-height:0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden}
.dsh-personal-todo-list{display:flex;min-height:0;flex-direction:column;gap:8px;overflow:auto;padding:10px;background:var(--dsw-alias-bg-layer-2);border-right:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:11px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}
.dsh-personal-todo-item[data-selected=true]{border-color:var(--dsw-alias-button-primary-fill)}
.dsh-personal-todo-select{display:block;width:100%;padding:0;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit}
.dsh-personal-todo-item h3,.dsh-personal-todo-detail h2,.dsh-personal-todo-detail h3{margin:0;color:var(--dsw-alias-label-primary);font-weight:500;overflow-wrap:anywhere}
.dsh-personal-todo-item h3{font-size:14px;line-height:21px}.dsh-personal-todo-detail h2{font-size:18px}.dsh-personal-todo-detail h3{font-size:13px;margin-top:16px}
.dsh-personal-todo-item p,.dsh-personal-todo-detail p{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-personal-todo-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-personal-todo-badge{display:inline-flex;padding:2px 7px;border-radius:10px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary)}
.dsh-personal-todo-badge[data-status=in_review]{color:var(--dsw-alias-state-success-label)}.dsh-personal-todo-badge[data-status=blocked]{color:var(--dsw-alias-state-warn-label)}
.dsh-personal-todo-badge[data-priority=high]{color:var(--dsw-alias-label-error)}.dsh-personal-todo-badge[data-priority=medium]{color:var(--dsw-alias-state-warn-label)}
.dsh-personal-todo-actions{display:flex;align-items:flex-start;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dsh-personal-todo-empty{padding:48px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-error{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-label-error);font-size:13px}
.dsh-personal-todo-more{align-self:center}.dsh-personal-todo-detail{min-width:0;overflow:auto;padding:20px}
.dsh-personal-todo-detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dsh-personal-todo-detail-actions{display:flex;gap:6px;flex-wrap:wrap}
.dsh-personal-todo-callout{margin-top:14px;padding:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-review{margin-top:14px;padding:14px;border-radius:12px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-review dl{display:grid;grid-template-columns:90px 1fr;gap:7px;margin:10px 0;font-size:13px}.dsh-personal-todo-review dt{color:var(--dsw-alias-label-tertiary)}.dsh-personal-todo-review dd{margin:0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.dsh-personal-todo-feedback{display:flex;flex-direction:column;gap:8px;margin-top:10px}.dsh-personal-todo-feedback textarea{min-height:72px}
.dsh-personal-todo-timeline{display:flex;flex-direction:column;gap:8px;margin-top:8px}.dsh-personal-todo-event{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:start;font-size:12px;color:var(--dsw-alias-label-secondary)}.dsh-personal-todo-event time{color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-session{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding:10px;border-radius:10px;background:var(--dsw-alias-bg-layer-3);font-size:13px}
.dsh-personal-todo-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}.dsh-personal-todo-field{display:flex;flex-direction:column;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-personal-todo-field[data-wide=true]{grid-column:1/-1}
.dsh-personal-todo-field textarea,.dsh-personal-todo-feedback textarea{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px;resize:vertical}.dsh-personal-todo-field textarea{min-height:100px}
.dsh-personal-todo-field select{width:100%;height:38px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px}
.dsh-personal-todo-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.dsh-personal-todo-small-dialog{width:min(480px,calc(100vw - 32px))}
@media(max-width:800px){.dsh-personal-todo-dialog{width:calc(100vw - 16px);height:calc(100vh - 16px)}.dsh-personal-todo-filters{grid-template-columns:1fr}.dsh-personal-todo-count{width:100%;margin-left:0}.dsh-personal-todo-workspace{grid-template-columns:1fr}.dsh-personal-todo-list{border-right:0;border-bottom:1px solid var(--dsw-alias-border-l2);max-height:42vh}.dsh-personal-todo-detail{min-height:42vh}.dsh-personal-todo-form{grid-template-columns:1fr}.dsh-personal-todo-field[data-wide=true],.dsh-personal-todo-form-actions{grid-column:auto}}
`

export interface PersonalTodoPanelInjected {
  readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>
  readonly get: (id: string, signal: AbortSignal) => Promise<TodoDetail>
  readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>
  readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>
  readonly start: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly reply: (request: ReplyTodoRequest, signal: AbortSignal) => Promise<Todo>
  readonly approve: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly requestChanges: (request: RequestTodoChangesRequest, signal: AbortSignal) => Promise<Todo>
  readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>
  readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>
}

export type PersonalTodoPanelProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected

type View = 'active' | 'completed'

interface FormState {
  readonly id?: string
  readonly title: string
  readonly notes: string
  readonly priority: TodoPriority
  readonly dueLocal: string
  readonly tags: string
}

const EMPTY_FORM: FormState = { title: '', notes: '', priority: 'none', dueLocal: '', tags: '' }
const ACTIVE_REFRESH_MS = 2_000

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
    priority: todo.priority,
    dueLocal: localDateTime(todo.dueAt),
    tags: todo.tags.join(', '),
  }
}

function dueAt(value: string): string | null {
  return value === '' ? null : new Date(value).toISOString()
}

/** Sidebar action and task-driven personal todo center. */
export function PersonalTodoPanel(props: PersonalTodoPanelProps) {
  const { wide, t, list, get, create, update, start, reply, approve, requestChanges, delete: deleteTodo, openSession } = props
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('active')
  const [todos, setTodos] = useState<Todo[]>([])
  const [result, setResult] = useState<TodoListResult>()
  const [selectedId, setSelectedId] = useState<string>()
  const [detail, setDetail] = useState<TodoDetail>()
  const [searchDraft, setSearchDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [filters, setFilters] = useState({ search: '', tags: [] as string[] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [form, setForm] = useState<FormState>()
  const [confirming, setConfirming] = useState<Todo>()
  const [replyText, setReplyText] = useState('')
  const [feedback, setFeedback] = useState('')
  const controllers = useRef(new Set<AbortController>())

  const withController = async <T,>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController()
    controllers.current.add(controller)
    try {
      return await operation(controller.signal)
    } finally {
      controllers.current.delete(controller)
    }
  }

  const fetchDetail = useCallback(async (id: string): Promise<void> => {
    try {
      const value = await withController(signal => get(id, signal))
      setDetail(value)
    } catch (reason) {
      setError(errorText(reason))
    }
  }, [get])

  const fetchPage = useCallback(async (offset: number, append = false, silent = false): Promise<void> => {
    if (!silent) setBusy(true)
    setError(undefined)
    try {
      const page = await withController(signal => list({
        statuses: view === 'active' ? ['pending', 'in_progress', 'blocked', 'in_review'] : ['completed'],
        ...(filters.search === '' ? {} : { search: filters.search }),
        ...(filters.tags.length === 0 ? {} : { tags: filters.tags }),
        offset,
      }, signal))
      setTodos(current => append ? [...current, ...page.todos] : page.todos.slice())
      setResult(page)
    } catch (reason) {
      setError(errorText(reason))
    } finally {
      if (!silent) setBusy(false)
    }
  }, [filters, list, view])

  const refresh = useCallback(async (silent = false): Promise<void> => {
    await Promise.all([
      fetchPage(0, false, silent),
      selectedId === undefined ? Promise.resolve() : fetchDetail(selectedId),
    ])
  }, [fetchDetail, fetchPage, selectedId])

  useEffect(() => {
    if (!open) return
    void fetchPage(0)
  }, [fetchPage, open])

  useEffect(() => {
    if (!open || !todos.some(todo => todo.status === 'in_progress')) return
    const interval = window.setInterval(() => { void refresh(true) }, ACTIVE_REFRESH_MS)
    return () => { window.clearInterval(interval) }
  }, [open, refresh, todos])

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
    setSelectedId(undefined)
    setDetail(undefined)
    setOpen(false)
  }

  const activeCount = (result?.counts.pending ?? 0) + (result?.counts.inProgress ?? 0)
    + (result?.counts.blocked ?? 0) + (result?.counts.inReview ?? 0)
  const summary = t('count.summary', { active: activeCount, review: result?.counts.inReview ?? 0, completed: result?.counts.completed ?? 0 })
  const formTitle = form?.id === undefined ? t('action.add') : t('action.edit')

  const statusLabel = (status: TodoStatus): string => {
    if (status === 'pending') return t('status.pending')
    if (status === 'in_progress') return t('status.inProgress')
    if (status === 'blocked') return t('status.blocked')
    if (status === 'in_review') return t('status.inReview')
    if (status === 'cancelled') return t('status.cancelled')
    return t('status.completed')
  }

  const priorityLabel = (priority: TodoPriority): string => {
    if (priority === 'none') return t('priority.none')
    if (priority === 'low') return t('priority.low')
    if (priority === 'medium') return t('priority.medium')
    return t('priority.high')
  }

  const eventLabel = (type: TodoEventType): string => t(`event.${type}`)

  const sessionLabel = (session: TodoSession, sessions: readonly TodoSession[]): string => {
    if (session.role === 'primary') return t('session.primary')
    const index = sessions.filter(candidate => candidate.role === 'related').findIndex(candidate => candidate.sessionId === session.sessionId)
    return t('session.related', { index: index + 1 })
  }

  const mutate = async (operation: (signal: AbortSignal) => Promise<unknown>): Promise<boolean> => {
    setBusy(true)
    setError(undefined)
    try {
      await withController(operation)
      await fetchPage(0)
      if (selectedId !== undefined) await fetchDetail(selectedId)
      return true
    } catch (reason) {
      setError(errorText(reason))
      return false
    } finally {
      setBusy(false)
    }
  }

  const selectTodo = (id: string): void => {
    setSelectedId(id)
    setReplyText('')
    setFeedback('')
    void fetchDetail(id)
  }

  const saveForm = (): void => {
    if (form === undefined || form.title.trim() === '') return
    const request: CreateTodoInput = {
      title: form.title,
      notes: form.notes === '' ? null : form.notes,
      priority: form.priority,
      dueAt: dueAt(form.dueLocal),
      tags: tagsFromText(form.tags),
    }
    void mutate(async (signal) => {
      if (form.id !== undefined) return update({ id: form.id, patch: request }, signal)
      const created = await create(request, signal)
      return start(created.id, signal)
    }).then((saved) => {
        if (saved) setForm(undefined)
      })
  }

  const openConversation = (sessionId: string, parentSessionId: string | null): void => {
    setBusy(true)
    setError(undefined)
    void openSession(sessionId, parentSessionId).then((opened) => {
      if (opened) close()
      else setError(t('state.sessionUnavailable'))
    }, (reason: unknown) => {
      setError(errorText(reason))
    }).finally(() => { setBusy(false) })
  }

  const emptyMessage = view === 'active' ? t('state.emptyActive') : t('state.emptyCompleted')
  const visibleTodos = useMemo(() => todos, [todos])
  const selectedRun = detail?.runs[0]

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
        data-wide={wide}
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
            <button type="button" className="dsh-personal-todo-tab" data-active={view === 'active'} onClick={() => { setView('active'); setSelectedId(undefined); setDetail(undefined) }}>{t('tab.active')}</button>
            <button type="button" className="dsh-personal-todo-tab" data-active={view === 'completed'} onClick={() => { setView('completed'); setSelectedId(undefined); setDetail(undefined) }}>{t('tab.completed')}</button>
          </div>
          <Button size="sm" variant="primary" icon={<IconPlusOutline16 />} onClick={() => { setForm({ ...EMPTY_FORM }) }}>{t('action.add')}</Button>
          <Button size="sm" icon={<IconRefreshOutline16 />} disabled={busy} onClick={() => { void refresh() }}>{t('action.refresh')}</Button>
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
        <div className="dsh-personal-todo-workspace">
          <div className="dsh-personal-todo-list">
            {busy && todos.length === 0 && <div className="dsh-personal-todo-empty">{t('state.loading')}</div>}
            {!busy && visibleTodos.length === 0 && <div className="dsh-personal-todo-empty">{emptyMessage}</div>}
            {visibleTodos.map(todo => (
              <article className="dsh-personal-todo-item" data-selected={todo.id === selectedId} key={todo.id}>
                <button type="button" className="dsh-personal-todo-select" onClick={() => { selectTodo(todo.id) }}>
                  <h3>{todo.title}</h3>
                  {todo.latestSummary !== null && <p>{todo.latestSummary}</p>}
                  <div className="dsh-personal-todo-meta">
                    <span className="dsh-personal-todo-badge" data-status={todo.status}>{statusLabel(todo.status)}</span>
                    <span className="dsh-personal-todo-badge" data-priority={todo.priority}>{priorityLabel(todo.priority)}</span>
                    {todo.tags.map(tag => <span className="dsh-personal-todo-badge" key={tag}>#{tag}</span>)}
                  </div>
                </button>
                <div className="dsh-personal-todo-actions">
                  {todo.status === 'pending' && <Button size="sm" variant="primary" disabled={busy} onClick={() => { void mutate(signal => start(todo.id, signal)) }}>{t('action.start')}</Button>}
                  <Button size="sm" icon={<IconEditOutline16 />} disabled={busy} aria-label={t('action.edit')} onClick={() => { setForm(formOf(todo)) }} />
                </div>
              </article>
            ))}
            {result?.hasMore === true && <Button className="dsh-personal-todo-more" size="sm" variant="outline" disabled={busy} onClick={() => { void fetchPage(todos.length, true) }}>{t('action.loadMore')}</Button>}
          </div>
          <section className="dsh-personal-todo-detail">
            {selectedId === undefined && <div className="dsh-personal-todo-empty">{t('detail.empty')}</div>}
            {selectedId !== undefined && detail === undefined && <div className="dsh-personal-todo-empty">{t('state.loadingDetail')}</div>}
            {detail !== undefined && detail.todo.id === selectedId && <>
              <div className="dsh-personal-todo-detail-header">
                <div><h2>{detail.todo.title}</h2><div className="dsh-personal-todo-meta"><span className="dsh-personal-todo-badge" data-status={detail.todo.status}>{statusLabel(detail.todo.status)}</span><span>{t('meta.reviewRound', { round: detail.todo.reviewRound })}</span></div></div>
                <div className="dsh-personal-todo-detail-actions">
                  {detail.todo.status === 'pending' && <Button variant="primary" disabled={busy} onClick={() => { void mutate(signal => start(detail.todo.id, signal)) }}>{t('action.start')}</Button>}
                  {detail.todo.primarySessionId !== null && <Button variant="outline" onClick={() => { openConversation(detail.todo.primarySessionId as string, null) }}>{t('action.openConversation')}</Button>}
                  {(detail.todo.status === 'pending' || detail.todo.status === 'completed' || detail.todo.status === 'cancelled') && <Button variant="outline" icon={<IconTrashOutline16 />} onClick={() => { setConfirming(detail.todo) }}>{t('action.delete')}</Button>}
                </div>
              </div>
              {detail.todo.notes !== null && <p>{detail.todo.notes}</p>}
              {detail.todo.blockedReason !== null && <div className="dsh-personal-todo-callout"><strong>{t('detail.waitingForYou')}</strong><p>{detail.todo.blockedReason}</p><div className="dsh-personal-todo-feedback"><textarea aria-label={t('reply.aria')} value={replyText} onChange={event => { setReplyText(event.target.value) }} placeholder={t('reply.placeholder')} /><Button variant="primary" disabled={busy || replyText.trim() === ''} onClick={() => { void mutate(signal => reply({ id: detail.todo.id, message: replyText }, signal)).then(saved => { if (saved) setReplyText('') }) }}>{t('action.reply')}</Button></div></div>}
              {detail.todo.status === 'in_review' && selectedRun !== undefined && <div className="dsh-personal-todo-review">
                <strong>{t('detail.review')}</strong>
                <dl><dt>{t('review.summary')}</dt><dd>{selectedRun.resultSummary ?? '—'}</dd><dt>{t('review.verification')}</dt><dd>{selectedRun.verification ?? '—'}</dd><dt>{t('review.risk')}</dt><dd>{selectedRun.risk ?? '—'}</dd></dl>
                <div className="dsh-personal-todo-detail-actions"><Button variant="primary" disabled={busy} onClick={() => { void mutate(signal => approve(detail.todo.id, signal)) }}>{t('action.approve')}</Button></div>
                <div className="dsh-personal-todo-feedback"><textarea aria-label={t('feedback.aria')} value={feedback} onChange={event => { setFeedback(event.target.value) }} placeholder={t('feedback.placeholder')} /><Button variant="outline" disabled={busy || feedback.trim() === ''} onClick={() => { void mutate(signal => requestChanges({ id: detail.todo.id, feedback }, signal)).then(saved => { if (saved) setFeedback('') }) }}>{t('action.requestChanges')}</Button></div>
              </div>}
              <h3>{t('detail.conversations')}</h3>
              {detail.sessions.length === 0 ? <p>{t('detail.noConversations')}</p> : detail.sessions.map(session => <div className="dsh-personal-todo-session" key={session.sessionId}><span>{sessionLabel(session, detail.sessions)}</span><Button size="sm" variant="outline" onClick={() => { openConversation(session.sessionId, session.parentSessionId) }}>{t('action.openConversation')}</Button></div>)}
              <h3>{t('detail.activity')}</h3>
              <div className="dsh-personal-todo-timeline">{detail.events.map(event => <div className="dsh-personal-todo-event" key={event.id}><span>•</span><span><strong>{eventLabel(event.type)}</strong>{event.message === null ? null : <> · {event.message}</>}</span><time>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div>
            </>}
          </section>
        </div>
      </Modal>
      <Modal open={form !== undefined} onClose={() => { setForm(undefined) }} title={formTitle} closeLabel={t('action.cancel')} className="dsh-personal-todo-small-dialog">
        {form !== undefined && <div className="dsh-personal-todo-form">
          <label className="dsh-personal-todo-field" data-wide="true">{t('field.title')}<Input autoFocus value={form.title} maxLength={200} placeholder={t('field.titlePlaceholder')} onChange={event => { setForm({ ...form, title: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-field" data-wide="true">{t('field.notes')}<textarea value={form.notes} maxLength={10_000} placeholder={t('field.notesPlaceholder')} onChange={event => { setForm({ ...form, notes: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-field">{t('field.priority')}<select value={form.priority} onChange={event => { setForm({ ...form, priority: event.target.value as TodoPriority }) }}><option value="none">{t('priority.none')}</option><option value="low">{t('priority.low')}</option><option value="medium">{t('priority.medium')}</option><option value="high">{t('priority.high')}</option></select></label>
          <label className="dsh-personal-todo-field">{t('field.dueAt')}<Input type="datetime-local" value={form.dueLocal} onChange={event => { setForm({ ...form, dueLocal: event.target.value }) }} /></label>
          <label className="dsh-personal-todo-field" data-wide="true">{t('field.tags')}<Input value={form.tags} placeholder={t('field.tagsPlaceholder')} onChange={event => { setForm({ ...form, tags: event.target.value }) }} /></label>
          <div className="dsh-personal-todo-form-actions"><Button variant="outline" onClick={() => { setForm(undefined) }}>{t('action.cancel')}</Button><Button variant="primary" disabled={busy || form.title.trim() === ''} onClick={saveForm}>{form.id === undefined ? t('action.create') : t('action.save')}</Button></div>
        </div>}
      </Modal>
      <Modal
        open={confirming !== undefined}
        onClose={() => { setConfirming(undefined) }}
        title={t('delete.title')}
        closeLabel={t('delete.close')}
        description={confirming === undefined ? '' : t('delete.description', { title: confirming.title })}
        className="dsh-personal-todo-small-dialog"
        footer={<><Button variant="outline" onClick={() => { setConfirming(undefined) }}>{t('action.cancel')}</Button><Button variant="primary" disabled={busy} onClick={() => {
          if (confirming === undefined) return
          const id = confirming.id
          void mutate(signal => deleteTodo(id, signal)).then((deleted) => {
            if (deleted) { setConfirming(undefined); setSelectedId(undefined); setDetail(undefined) }
          })
        }}>{t('action.delete')}</Button></>}
      />
    </>
  )
}
