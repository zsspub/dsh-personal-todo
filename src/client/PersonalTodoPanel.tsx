import React, {
  useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, IconEditOutline16, IconEllipsisOutline16, IconListPenOutline16,
  IconPlusOutline16, IconRefreshOutline16, IconTrashOutline16, Input, Menu, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CreateTodoInput, DeleteTodoResult, ListTodoInput, ReplyTodoRequest,
  RequestTodoChangesRequest, Todo, TodoDetail, TodoEventType, TodoListResult,
  TodoPriority, TodoSession, TodoStatus, UpdateTodoRequest,
} from '../types.ts'
import { TODO_STATUSES } from '../types.ts'
import type { PersonalTodoCanvasController } from './canvas.ts'
import type { NS } from './locales.ts'

// The slot renderer anchors list slots with inline `display: contents`. A wide
// sidebar reifies that wrapper so every footer action occupies its own row.
const CSS = `
.dsh-personal-todo-trigger{position:relative;min-width:28px}
.dsh-personal-todo-attention{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;margin-left:auto;padding:0 5px;border-radius:9px;background:var(--dsw-alias-label-error);color:var(--dsw-alias-bg-layer-1);font-size:11px;line-height:18px}
.dsh-personal-todo-trigger[data-wide=false] .dsh-personal-todo-attention{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 4px;line-height:16px}
[data-slot='sidebar.footer.action']:has(.dsh-personal-todo-trigger[data-wide=true]){display:flex!important;flex:1;flex-direction:column;min-width:0;width:100%}
.dsh-personal-todo-trigger[data-wide=true]{justify-content:flex-start;width:100%}
.dsh-personal-todo-canvas{position:absolute;top:0;bottom:0;z-index:1;display:flex;box-sizing:border-box;min-width:0;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base);border-left:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-canvas-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 20px 14px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-canvas-heading{min-width:0}.dsh-personal-todo-canvas-heading h2{margin:0;color:var(--dsw-alias-label-primary);font-size:16px;line-height:24px;font-weight:500}.dsh-personal-todo-canvas-heading p{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsh-personal-todo-close{display:grid;flex:none;place-items:center;width:28px;height:28px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.dsh-personal-todo-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-personal-todo-body{display:flex;flex:1;flex-direction:column;min-height:0;gap:8px;padding:12px 16px 16px}
.dsh-personal-todo-toolbar{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-personal-todo-status-row{display:flex;align-items:center;min-width:0}
.dsh-personal-todo-tabs{display:flex;flex:1;gap:4px;min-width:0;padding:3px;border-radius:16px;background:var(--dsw-alias-bg-layer-3);overflow-x:auto;scrollbar-width:none}.dsh-personal-todo-tabs::-webkit-scrollbar{display:none}
.dsh-personal-todo-tab{display:inline-flex;flex:none;align-items:center;gap:5px;border:0;border-radius:13px;padding:5px 10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}
.dsh-personal-todo-tab[data-active=true]{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dsh-personal-todo-tab-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:var(--dsw-alias-fill-l2);color:inherit;font-size:11px;line-height:18px}
.dsh-personal-todo-more-trigger{display:inline-flex;flex:none;align-items:center;gap:5px;min-height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:5px 10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}.dsh-personal-todo-more-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-personal-todo-more-trigger[data-active=true]{border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary)}
.dsh-personal-todo-filters{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:center;gap:8px}.dsh-personal-todo-filters>*{min-width:0}
.dsh-personal-todo-workspace{display:flex;flex:1;min-height:0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden}
.dsh-personal-todo-workspace[data-has-selection=true] .dsh-personal-todo-list{display:none}.dsh-personal-todo-workspace[data-has-selection=false] .dsh-personal-todo-detail-pane{display:none}
.dsh-personal-todo-list{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;gap:8px;overflow:auto;padding:10px;background:var(--dsw-alias-bg-layer-2)}
.dsh-personal-todo-assignee-group{display:flex;flex-direction:column;gap:8px}.dsh-personal-todo-assignee-group+.dsh-personal-todo-assignee-group{margin-top:8px}
.dsh-personal-todo-assignee-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0;padding:2px 2px 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:500}.dsh-personal-todo-assignee-count{color:var(--dsw-alias-label-tertiary);font-weight:400}
.dsh-personal-todo-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:11px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3)}
.dsh-personal-todo-item[data-selected=true]{border-color:var(--dsw-alias-button-primary-fill)}
.dsh-personal-todo-select{display:block;width:100%;padding:0;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit}
.dsh-personal-todo-item h3,.dsh-personal-todo-detail h2,.dsh-personal-todo-detail h3{margin:0;color:var(--dsw-alias-label-primary);font-weight:500;overflow-wrap:anywhere}
.dsh-personal-todo-item h3{font-size:14px;line-height:21px}.dsh-personal-todo-detail h2{font-size:18px}.dsh-personal-todo-detail h3{font-size:13px;margin-top:16px}
.dsh-personal-todo-item p,.dsh-personal-todo-detail p{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-personal-todo-item p{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;white-space:normal}
.dsh-personal-todo-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-personal-todo-badge{display:inline-flex;padding:2px 7px;border-radius:10px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary)}
.dsh-personal-todo-badge[data-status=in_review]{color:var(--dsw-alias-state-success-label)}.dsh-personal-todo-badge[data-status=blocked]{color:var(--dsw-alias-state-warn-label)}
.dsh-personal-todo-badge[data-priority=high]{color:var(--dsw-alias-label-error)}.dsh-personal-todo-badge[data-priority=medium]{color:var(--dsw-alias-state-warn-label)}
.dsh-personal-todo-actions{display:flex;align-items:flex-start;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.dsh-personal-todo-empty{padding:48px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-error{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-label-error);font-size:13px}
.dsh-personal-todo-more{align-self:center}.dsh-personal-todo-detail-pane{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}.dsh-personal-todo-detail{min-width:0;min-height:0;flex:1;overflow:auto;padding:18px 20px}
.dsh-personal-todo-detail-header{display:flex;align-items:flex-start;flex-direction:column;gap:12px}.dsh-personal-todo-detail-actions{display:flex;gap:6px;flex-wrap:wrap}
.dsh-personal-todo-back{display:inline-flex;margin-bottom:10px}
.dsh-personal-todo-callout{margin-top:14px;padding:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-review{margin-top:14px;padding:14px;border-radius:12px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-review dl{display:grid;grid-template-columns:90px 1fr;gap:7px;margin:10px 0;font-size:13px}.dsh-personal-todo-review dt{color:var(--dsw-alias-label-tertiary)}.dsh-personal-todo-review dd{margin:0;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
.dsh-personal-todo-commandbar{display:flex;align-items:stretch;flex-direction:column;gap:10px;flex:none;padding:10px 20px 12px}.dsh-personal-todo-commandbar textarea{min-width:0;min-height:72px;flex:1}.dsh-personal-todo-commandbar-actions{display:flex;justify-content:flex-end;gap:8px;flex:none}
.dsh-personal-todo-timeline{display:flex;flex-direction:column;gap:8px;margin-top:8px}.dsh-personal-todo-event{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:start;font-size:12px;color:var(--dsw-alias-label-secondary)}.dsh-personal-todo-event time{color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-session{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px;padding:10px;border-radius:10px;background:var(--dsw-alias-bg-layer-3);font-size:13px}
.dsh-personal-todo-form{display:grid;grid-template-columns:1fr;gap:12px}.dsh-personal-todo-field{display:flex;flex-direction:column;gap:5px;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-personal-todo-field[data-wide=true]{grid-column:1/-1}
.dsh-personal-todo-field textarea,.dsh-personal-todo-commandbar textarea{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px;resize:vertical}.dsh-personal-todo-field textarea{min-height:100px}
.dsh-personal-todo-field select{width:100%;height:38px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px}
.dsh-personal-todo-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;margin-top:4px}.dsh-personal-todo-small-dialog{width:min(480px,calc(100vw - 32px))}
@media(max-width:800px){.dsh-personal-todo-canvas-header{padding:14px}.dsh-personal-todo-canvas-heading p{display:none}.dsh-personal-todo-body{padding:10px}.dsh-personal-todo-detail{padding:14px}.dsh-personal-todo-commandbar{padding:10px 14px 12px}.dsh-personal-todo-field[data-wide=true],.dsh-personal-todo-form-actions{grid-column:auto}}
`

export interface PersonalTodoPanelInjected {
  readonly canvas: PersonalTodoCanvasController
  readonly openCanvas: () => void
  readonly closeCanvas: () => void
  readonly list: (request: ListTodoInput, signal: AbortSignal) => Promise<TodoListResult>
  readonly get: (id: string, signal: AbortSignal) => Promise<TodoDetail>
  readonly create: (request: CreateTodoInput, signal: AbortSignal) => Promise<Todo>
  readonly update: (request: UpdateTodoRequest, signal: AbortSignal) => Promise<Todo>
  readonly start: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly reply: (request: ReplyTodoRequest, signal: AbortSignal) => Promise<Todo>
  readonly approve: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly archive: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly restore: (id: string, signal: AbortSignal) => Promise<Todo>
  readonly requestChanges: (request: RequestTodoChangesRequest, signal: AbortSignal) => Promise<Todo>
  readonly delete: (id: string, signal: AbortSignal) => Promise<DeleteTodoResult>
  readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>
}

export type PersonalTodoTriggerProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected

export type PersonalTodoCanvasProps =
  PropsRuntime<'shell.overlay'> & PropsLocale<typeof NS> & PersonalTodoPanelInjected

type View = TodoStatus | 'archived'

interface FormState {
  readonly id?: string
  readonly title: string
  readonly notes: string
  readonly assignee: string
  readonly priority: TodoPriority
  readonly dueLocal: string
  readonly tags: string
}

interface AssigneeGroup {
  readonly key: string
  readonly assignee: string | null
  readonly todos: Todo[]
}

const EMPTY_FORM: FormState = { title: '', notes: '', assignee: '', priority: 'none', dueLocal: '', tags: '' }
const ACTIVE_REFRESH_MS = 2_000
const PRIMARY_VIEWS = ['pending', 'in_progress', 'blocked', 'in_review'] as const satisfies readonly TodoStatus[]
const MORE_VIEWS = ['completed', 'cancelled', 'archived'] as const satisfies readonly View[]

function isMoreView(value: View): value is (typeof MORE_VIEWS)[number] {
  return value === 'completed' || value === 'cancelled' || value === 'archived'
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
    assignee: todo.assignee ?? '',
    priority: todo.priority,
    dueLocal: localDateTime(todo.dueAt),
    tags: todo.tags.join(', '),
  }
}

function groupByAssignee(todos: readonly Todo[]): AssigneeGroup[] {
  const groups = new Map<string, AssigneeGroup>()
  for (const todo of todos) {
    const key = todo.assignee ?? ''
    const group = groups.get(key)
    if (group === undefined) groups.set(key, { key, assignee: todo.assignee, todos: [todo] })
    else group.todos.push(todo)
  }
  return [...groups.values()].sort((left, right) => {
    if (left.assignee === null) return right.assignee === null ? 0 : 1
    if (right.assignee === null) return -1
    return left.assignee.localeCompare(right.assignee)
  })
}

function dueAt(value: string): string | null {
  return value === '' ? null : new Date(value).toISOString()
}

function normalizedAssignee(value: string): string | null {
  const assignee = value.trim()
  return assignee === '' ? null : assignee
}

/** Sidebar action opening the task Canvas and surfacing attention work. */
export function PersonalTodoTrigger({ wide, t, list, canvas, openCanvas }: PersonalTodoTriggerProps) {
  const snapshot = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot)

  useEffect(() => {
    let controller: AbortController | undefined
    const refresh = (): void => {
      controller?.abort()
      controller = new AbortController()
      void list({ statuses: ['blocked', 'in_review'], limit: 1 }, controller.signal).then(
        page => { canvas.setAttentionCount(page.counts.blocked + page.counts.inReview) },
        () => undefined,
      )
    }
    refresh()
    const interval = window.setInterval(refresh, ACTIVE_REFRESH_MS)
    return () => {
      window.clearInterval(interval)
      controller?.abort()
    }
  }, [canvas, list])

  const triggerLabel = snapshot.attentionCount === 0
    ? t('trigger.aria')
    : t('trigger.attention', { count: snapshot.attentionCount })

  return (
    <>
      <style>{CSS}</style>
      <Button
        className="dsh-personal-todo-trigger"
        variant="ghost"
        size="sm"
        icon={<IconListPenOutline16 />}
        aria-label={triggerLabel}
        title={triggerLabel}
        data-wide={wide}
        onClick={openCanvas}
      >
        {wide ? <span>{t('trigger.label')}</span> : null}
        {snapshot.attentionCount > 0 && (
          <span className="dsh-personal-todo-attention" aria-hidden="true">{snapshot.attentionCount}</span>
        )}
      </Button>
    </>
  )
}

/** Task-driven personal todo Canvas rendered on the right side of the frame. */
export function PersonalTodoCanvas(props: PersonalTodoCanvasProps) {
  const {
    t, canvas, list, get, create, update, start, reply, approve, archive, restore,
    requestChanges, delete: deleteTodo, openSession, closeCanvas,
  } = props
  const snapshot = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot)
  const surfaceRef = useRef<HTMLElement | null>(null)
  const [column, setColumn] = useState({ left: 0, width: 0 })
  const [view, setView] = useState<View>('pending')
  const [todos, setTodos] = useState<Todo[]>([])
  const [result, setResult] = useState<TodoListResult>()
  const [selectedId, setSelectedId] = useState<string>()
  const selectedIdRef = useRef<string>()
  const [detail, setDetail] = useState<TodoDetail>()
  const [searchDraft, setSearchDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [filters, setFilters] = useState({ search: '', tags: [] as string[] })
  const [moreOpen, setMoreOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [form, setForm] = useState<FormState>()
  const [confirming, setConfirming] = useState<Todo>()
  const [replyText, setReplyText] = useState('')
  const [feedback, setFeedback] = useState('')
  const controllers = useRef(new Set<AbortController>())
  selectedIdRef.current = selectedId

  useLayoutEffect(() => {
    if (!snapshot.open) return
    const surface = surfaceRef.current
    const overlay = surface?.closest<HTMLElement>('[data-shell-overlay]')
    const details = overlay?.previousElementSibling
    if (overlay === null || overlay === undefined || !(details instanceof HTMLElement)) return
    const updateColumn = (): void => {
      const overlayRect = overlay.getBoundingClientRect()
      const detailsRect = details.getBoundingClientRect()
      setColumn({ left: detailsRect.left - overlayRect.left, width: detailsRect.width })
    }
    updateColumn()
    const observer = new ResizeObserver(updateColumn)
    observer.observe(overlay)
    observer.observe(details)
    return () => { observer.disconnect() }
  }, [snapshot.open])

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

  const fetchPage = useCallback(async (offset: number, append = false, silent = false): Promise<TodoListResult | undefined> => {
    if (!silent) setBusy(true)
    setError(undefined)
    try {
      const page = await withController(signal => list({
        statuses: view === 'archived' ? TODO_STATUSES : [view],
        archived: view === 'archived',
        ...(filters.search === '' ? {} : { search: filters.search }),
        ...(filters.tags.length === 0 ? {} : { tags: filters.tags }),
        offset,
      }, signal))
      setTodos(current => append ? [...current, ...page.todos] : page.todos.slice())
      setResult(page)
      if (!append && selectedIdRef.current !== undefined
        && !page.todos.some(todo => todo.id === selectedIdRef.current)) {
        setSelectedId(undefined)
        setDetail(undefined)
      }
      canvas.setAttentionCount(page.counts.blocked + page.counts.inReview)
      return page
    } catch (reason) {
      setError(errorText(reason))
      return undefined
    } finally {
      if (!silent) setBusy(false)
    }
  }, [canvas, filters, list, view])

  const refresh = useCallback(async (silent = false): Promise<void> => {
    await Promise.all([
      fetchPage(0, false, silent),
      selectedId === undefined ? Promise.resolve() : fetchDetail(selectedId),
    ])
  }, [fetchDetail, fetchPage, selectedId])

  useEffect(() => {
    void fetchPage(0)
  }, [fetchPage])

  useEffect(() => {
    if (!todos.some(todo => todo.status === 'in_progress')) return
    const interval = window.setInterval(() => { void refresh(true) }, ACTIVE_REFRESH_MS)
    return () => { window.clearInterval(interval) }
  }, [refresh, todos])

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
    setMoreOpen(false)
    setSelectedId(undefined)
    setDetail(undefined)
    closeCanvas()
  }

  const statusLabel = (status: TodoStatus): string => {
    if (status === 'pending') return t('status.pending')
    if (status === 'in_progress') return t('status.inProgress')
    if (status === 'blocked') return t('status.blocked')
    if (status === 'in_review') return t('status.inReview')
    if (status === 'cancelled') return t('status.cancelled')
    return t('status.completed')
  }

  const viewLabel = (value: View): string => value === 'archived'
    ? t('tab.archived')
    : statusLabel(value)

  const viewCount = (value: View): number => {
    if (value === 'pending') return result?.counts.pending ?? 0
    if (value === 'in_progress') return result?.counts.inProgress ?? 0
    if (value === 'blocked') return result?.counts.blocked ?? 0
    if (value === 'in_review') return result?.counts.inReview ?? 0
    if (value === 'completed') return result?.counts.completed ?? 0
    if (value === 'cancelled') return result?.counts.cancelled ?? 0
    return result?.counts.archived ?? 0
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

  const mutate = async (operation: (signal: AbortSignal) => Promise<unknown>, refreshSelected = true): Promise<boolean> => {
    setBusy(true)
    setError(undefined)
    try {
      await withController(operation)
      await fetchPage(0)
      if (refreshSelected && selectedId !== undefined) await fetchDetail(selectedId)
      return true
    } catch (reason) {
      setError(errorText(reason))
      return false
    } finally {
      setBusy(false)
    }
  }

  const selectTodo = (id: string): void => {
    setForm(undefined)
    setSelectedId(id)
    setReplyText('')
    setFeedback('')
    void fetchDetail(id)
  }

  const saveForm = (): void => {
    if (form === undefined || form.title.trim() === '') return
    const creating = form.id === undefined
    const assignee = normalizedAssignee(form.assignee)
    const request: CreateTodoInput = {
      title: form.title,
      notes: form.notes === '' ? null : form.notes,
      assignee,
      priority: form.priority,
      dueAt: dueAt(form.dueLocal),
      tags: tagsFromText(form.tags),
    }
    void mutate(async (signal) => {
      if (form.id !== undefined) {
        const updated = await update({ id: form.id, patch: request }, signal)
        if (updated.assignee !== assignee) throw new Error(t('state.assigneeUpdateMismatch'))
        return updated
      }
      const created = await create(request, signal)
      return start(created.id, signal)
    }).then((saved) => {
      if (!saved) return
      setForm(undefined)
      if (creating) setView('in_progress')
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

  const emptyMessage = view === 'archived'
    ? t('state.emptyArchived')
    : t('state.emptyStatus', { status: statusLabel(view) })
  const selectedRun = detail?.runs[0]
  const assigneeGroups = groupByAssignee(todos)

  const selectView = (value: View): void => {
    setView(value)
    setMoreOpen(false)
    setForm(undefined)
    setSelectedId(undefined)
    setDetail(undefined)
  }

  if (!snapshot.open) return null

  return (
    <>
      <style>{CSS}</style>
      <section
        ref={surfaceRef}
        className="dsh-personal-todo-canvas"
        aria-label={t('panel.title')}
        style={{ left: column.left, width: column.width }}
      >
        <header className="dsh-personal-todo-canvas-header">
          <div className="dsh-personal-todo-canvas-heading">
            <h2>{t('panel.title')}</h2>
            <p>{t('panel.description')}</p>
          </div>
          <button type="button" className="dsh-personal-todo-close" aria-label={t('panel.close')} onClick={close}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="dsh-personal-todo-body">
          <div className="dsh-personal-todo-status-row">
            <div className="dsh-personal-todo-tabs" role="tablist" aria-label={t('tab.statuses')}>
              {PRIMARY_VIEWS.map(value => <button
                type="button"
                role="tab"
                className="dsh-personal-todo-tab"
                aria-selected={view === value}
                data-active={view === value}
                key={value}
                onClick={() => { selectView(value) }}
              >
                <span>{viewLabel(value)}</span>
                <span className="dsh-personal-todo-tab-count">{viewCount(value)}</span>
              </button>)}
            </div>
          </div>
          <div className="dsh-personal-todo-toolbar">
            <Button size="sm" variant="primary" icon={<IconPlusOutline16 />} onClick={() => { setSelectedId(undefined); setDetail(undefined); setForm({ ...EMPTY_FORM }) }}>{t('action.add')}</Button>
            <Button size="sm" icon={<IconRefreshOutline16 />} disabled={busy} onClick={() => { void refresh() }}>{t('action.refresh')}</Button>
            <Menu
              open={moreOpen}
              onClose={() => { setMoreOpen(false) }}
              items={MORE_VIEWS.map(value => ({
                id: value,
                label: `${viewLabel(value)} ${String(viewCount(value))}`,
              }))}
              selectedId={isMoreView(view) ? view : undefined}
              onSelect={(id) => {
                if (id === 'completed' || id === 'cancelled' || id === 'archived') selectView(id)
              }}
              align="end"
              portal
              dense
              anchor={(
                <button
                  type="button"
                  className="dsh-personal-todo-more-trigger"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  data-active={isMoreView(view)}
                  onClick={() => { setMoreOpen(current => !current) }}
                >
                  <IconEllipsisOutline16 />
                  <span>{t('action.more')}</span>
                </button>
              )}
            />
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
          <div className="dsh-personal-todo-workspace" data-has-selection={selectedId !== undefined || form !== undefined}>
          <div className="dsh-personal-todo-list">
            {busy && todos.length === 0 && <div className="dsh-personal-todo-empty">{t('state.loading')}</div>}
            {!busy && todos.length === 0 && <div className="dsh-personal-todo-empty">{emptyMessage}</div>}
            {assigneeGroups.map((group, groupIndex) => (
              <section className="dsh-personal-todo-assignee-group" aria-labelledby={`todo-assignee-group-${String(groupIndex)}`} key={group.key}>
                <h3 className="dsh-personal-todo-assignee-heading" id={`todo-assignee-group-${String(groupIndex)}`}>
                  <span>{group.assignee ?? t('assignee.unassigned')}</span>
                  <span className="dsh-personal-todo-assignee-count">{group.todos.length}</span>
                </h3>
                {group.todos.map(todo => (
                  <article className="dsh-personal-todo-item" data-selected={todo.id === selectedId} key={todo.id}>
                    <button type="button" className="dsh-personal-todo-select" onClick={() => { selectTodo(todo.id) }}>
                      <h3>{todo.title}</h3>
                      {(todo.latestSummary ?? todo.notes) !== null && <p>{todo.latestSummary ?? todo.notes}</p>}
                      <div className="dsh-personal-todo-meta">
                        <span className="dsh-personal-todo-badge" data-status={todo.status}>{statusLabel(todo.status)}</span>
                        <span className="dsh-personal-todo-badge" data-priority={todo.priority}>{priorityLabel(todo.priority)}</span>
                        {todo.tags.map(tag => <span className="dsh-personal-todo-badge" key={tag}>#{tag}</span>)}
                      </div>
                    </button>
                    <div className="dsh-personal-todo-actions">
                      {todo.status === 'pending' && <Button size="sm" variant="primary" disabled={busy} onClick={() => { void mutate(signal => start(todo.id, signal)) }}>{t('action.start')}</Button>}
                    </div>
                  </article>
                ))}
              </section>
            ))}
            {result?.hasMore === true && <Button className="dsh-personal-todo-more" size="sm" variant="outline" disabled={busy} onClick={() => { void fetchPage(todos.length, true) }}>{t('action.loadMore')}</Button>}
          </div>
          <div className="dsh-personal-todo-detail-pane">
            <section className="dsh-personal-todo-detail">
            {form !== undefined && <>
              <div className="dsh-personal-todo-detail-header">
                <h2>{form.id === undefined ? t('action.add') : t('action.edit')}</h2>
              </div>
              <div className="dsh-personal-todo-form">
                <label className="dsh-personal-todo-field" data-wide="true">{t('field.title')}<Input autoFocus value={form.title} maxLength={200} placeholder={t('field.titlePlaceholder')} onChange={event => { setForm({ ...form, title: event.target.value }) }} /></label>
                <label className="dsh-personal-todo-field" data-wide="true">{t('field.notes')}<textarea value={form.notes} maxLength={10_000} placeholder={t('field.notesPlaceholder')} onChange={event => { setForm({ ...form, notes: event.target.value }) }} /></label>
                <label className="dsh-personal-todo-field" data-wide="true">{t('field.assignee')}<Input value={form.assignee} maxLength={100} placeholder={t('field.assigneePlaceholder')} onChange={event => { setForm({ ...form, assignee: event.target.value }) }} /></label>
                <label className="dsh-personal-todo-field">{t('field.priority')}<select value={form.priority} onChange={event => { setForm({ ...form, priority: event.target.value as TodoPriority }) }}><option value="none">{t('priority.none')}</option><option value="low">{t('priority.low')}</option><option value="medium">{t('priority.medium')}</option><option value="high">{t('priority.high')}</option></select></label>
                <label className="dsh-personal-todo-field">{t('field.dueAt')}<Input type="datetime-local" value={form.dueLocal} onChange={event => { setForm({ ...form, dueLocal: event.target.value }) }} /></label>
                <label className="dsh-personal-todo-field" data-wide="true">{t('field.tags')}<Input value={form.tags} placeholder={t('field.tagsPlaceholder')} onChange={event => { setForm({ ...form, tags: event.target.value }) }} /></label>
                <div className="dsh-personal-todo-form-actions"><Button variant="outline" onClick={() => { setForm(undefined) }}>{t('action.cancel')}</Button><Button variant="primary" disabled={busy || form.title.trim() === ''} onClick={saveForm}>{form.id === undefined ? t('action.create') : t('action.save')}</Button></div>
              </div>
            </>}
            {form === undefined && selectedId === undefined && <div className="dsh-personal-todo-empty">{t('detail.empty')}</div>}
            {form === undefined && selectedId !== undefined && detail === undefined && <div className="dsh-personal-todo-empty">{t('state.loadingDetail')}</div>}
            {form === undefined && detail !== undefined && detail.todo.id === selectedId && <>
              <div className="dsh-personal-todo-detail-header">
                <div><Button className="dsh-personal-todo-back" size="sm" variant="outline" onClick={() => { setSelectedId(undefined); setDetail(undefined) }}>{t('action.back')}</Button><h2>{detail.todo.title}</h2><div className="dsh-personal-todo-meta"><span className="dsh-personal-todo-badge" data-status={detail.todo.status}>{statusLabel(detail.todo.status)}</span><span>{t('meta.assignee', { assignee: detail.todo.assignee ?? t('assignee.unassigned') })}</span><span>{t('meta.reviewRound', { round: detail.todo.reviewRound })}</span></div></div>
                <div className="dsh-personal-todo-detail-actions">
                  {detail.todo.status === 'pending' && <Button variant="primary" disabled={busy} onClick={() => { void mutate(signal => start(detail.todo.id, signal)) }}>{t('action.start')}</Button>}
                  {detail.todo.primarySessionId !== null && <Button variant="outline" onClick={() => { openConversation(detail.todo.primarySessionId as string, null) }}>{t('action.openConversation')}</Button>}
                  <Button variant="outline" icon={<IconEditOutline16 />} disabled={busy} onClick={() => { setForm(formOf(detail.todo)) }}>{t('action.edit')}</Button>
                  {detail.todo.archivedAt === null && <Button variant="outline" disabled={busy} onClick={() => {
                    void mutate(signal => archive(detail.todo.id, signal), false).then((saved) => {
                      if (saved) { setSelectedId(undefined); setDetail(undefined) }
                    })
                  }}>{t('action.archive')}</Button>}
                  {detail.todo.archivedAt !== null && <Button variant="outline" disabled={busy} onClick={() => {
                    void mutate(signal => restore(detail.todo.id, signal), false).then((saved) => {
                      if (saved) { setSelectedId(undefined); setDetail(undefined) }
                    })
                  }}>{t('action.restore')}</Button>}
                  {(detail.todo.archivedAt !== null || detail.todo.status === 'pending' || detail.todo.status === 'completed' || detail.todo.status === 'cancelled') && <Button variant="outline" icon={<IconTrashOutline16 />} onClick={() => { setConfirming(detail.todo) }}>{t('action.delete')}</Button>}
                </div>
              </div>
              {detail.todo.notes !== null && <p>{detail.todo.notes}</p>}
              {detail.todo.archivedAt !== null && <div className="dsh-personal-todo-meta"><span>{t('meta.archived', { date: new Date(detail.todo.archivedAt).toLocaleString() })}</span></div>}
              {detail.todo.blockedReason !== null && <div className="dsh-personal-todo-callout"><strong>{t('detail.waitingForYou')}</strong><p>{detail.todo.blockedReason}</p></div>}
              {detail.todo.status === 'in_review' && selectedRun !== undefined && <div className="dsh-personal-todo-review">
                <strong>{t('detail.review')}</strong>
                <dl><dt>{t('review.summary')}</dt><dd>{selectedRun.resultSummary ?? '—'}</dd><dt>{t('review.verification')}</dt><dd>{selectedRun.verification ?? '—'}</dd><dt>{t('review.risk')}</dt><dd>{selectedRun.risk ?? '—'}</dd></dl>
              </div>}
              <h3>{t('detail.conversations')}</h3>
              {detail.sessions.length === 0 ? <p>{t('detail.noConversations')}</p> : detail.sessions.map(session => <div className="dsh-personal-todo-session" key={session.sessionId}><span>{sessionLabel(session, detail.sessions)}</span><Button size="sm" variant="outline" onClick={() => { openConversation(session.sessionId, session.parentSessionId) }}>{t('action.openConversation')}</Button></div>)}
              <h3>{t('detail.activity')}</h3>
              <div className="dsh-personal-todo-timeline">{detail.events.map(event => <div className="dsh-personal-todo-event" key={event.id}><span>•</span><span><strong>{eventLabel(event.type)}</strong>{event.message === null ? null : <> · {event.message}</>}</span><time>{new Date(event.createdAt).toLocaleString()}</time></div>)}</div>
            </>}
            </section>
            {form === undefined && detail !== undefined && detail.todo.id === selectedId && detail.todo.status === 'blocked' && <div className="dsh-personal-todo-commandbar"><textarea aria-label={t('reply.aria')} value={replyText} onChange={event => { setReplyText(event.target.value) }} placeholder={t('reply.placeholder')} /><div className="dsh-personal-todo-commandbar-actions"><Button variant="primary" disabled={busy || replyText.trim() === ''} onClick={() => { void mutate(signal => reply({ id: detail.todo.id, message: replyText }, signal)).then(saved => { if (saved) setReplyText('') }) }}>{t('action.reply')}</Button></div></div>}
            {form === undefined && detail !== undefined && detail.todo.id === selectedId && detail.todo.status === 'in_review' && <div className="dsh-personal-todo-commandbar"><textarea aria-label={t('feedback.aria')} value={feedback} onChange={event => { setFeedback(event.target.value) }} placeholder={t('feedback.placeholder')} /><div className="dsh-personal-todo-commandbar-actions"><Button variant="outline" disabled={busy || feedback.trim() === ''} onClick={() => { void mutate(signal => requestChanges({ id: detail.todo.id, feedback }, signal)).then(saved => { if (saved) setFeedback('') }) }}>{t('action.requestChanges')}</Button><Button variant="primary" disabled={busy} onClick={() => { void mutate(signal => approve(detail.todo.id, signal)) }}>{t('action.approve')}</Button></div></div>}
          </div>
          </div>
        </div>
      </section>
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
          void mutate(signal => deleteTodo(id, signal), false).then((deleted) => {
            if (deleted) { setConfirming(undefined); setSelectedId(undefined); setDetail(undefined) }
          })
        }}>{t('action.delete')}</Button></>}
      />
    </>
  )
}
