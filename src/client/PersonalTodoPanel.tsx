import React, {
  useCallback, useEffect, useRef, useState, useSyncExternalStore,
} from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button, Menu, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Archive, ArrowDown, ArrowLeft, CalendarDays, ChevronRight, ChevronsUp, CircleCheck, CircleDashed, CircleDot, CircleX, ClipboardCheck, ClipboardList, Copy, Ellipsis, Equal, Flag, GitBranch, ListTodo, LoaderCircle, MessageCircle, MessageSquare, Pencil, Play, Plus, Tag, Trash2, Undo2, UserRound, X } from 'lucide-react'
import type {
  CreateTodoInput, DeleteTodoResult, ListTodoInput, ReplyTodoRequest,
  RequestTodoChangesRequest, Todo, TodoDetail, TodoEventType, TodoListResult,
  TodoPriority, TodoSession, TodoStatus, UpdateTodoRequest,
} from '../types.ts'
import { TODO_STATUSES } from '../types.ts'
import type { PersonalTodoCanvasController } from './canvas.ts'
import type { NS } from './locales.ts'

// 插槽渲染器为列表插槽设置内联 display: contents。
// 宽侧栏下将包裹层恢复为布局容器，使每个底部操作独占一行。
const CSS = `
.dsh-personal-todo-trigger{position:relative;min-width:28px}
.dsh-personal-todo-attention{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;margin-left:auto;padding:0 5px;border-radius:9px;background:var(--dsw-alias-label-error);color:var(--dsw-alias-bg-layer-1);font-size:11px;line-height:18px}
.dsh-personal-todo-trigger[data-wide=false] .dsh-personal-todo-attention{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;padding:0 4px;line-height:16px}
[data-slot='sidebar.footer.action']:has(.dsh-personal-todo-trigger[data-wide=true]){display:flex!important;flex:1;flex-direction:column;min-width:0;width:100%}
.dsh-personal-todo-trigger[data-wide=true]{justify-content:flex-start;width:100%}
.dsh-personal-todo-canvas{position:absolute;top:8px;right:8px;bottom:8px;z-index:1;display:flex;box-sizing:border-box;width:440px;max-width:calc(100% - 16px);min-width:0;flex-direction:column;overflow:hidden;pointer-events:auto;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:16px;box-shadow:var(--dsw-shadow-lv3,0 12px 40px rgb(0 0 0 / 28%))}
.dsh-personal-todo-canvas-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 20px 14px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-canvas-heading{min-width:0}.dsh-personal-todo-canvas-heading h2{margin:0;color:var(--dsw-alias-label-primary);font-size:16px;line-height:24px;font-weight:500}.dsh-personal-todo-canvas-heading p{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsh-personal-todo-close{display:grid;flex:none;place-items:center;width:28px;height:28px;margin-right:-8px;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.dsh-personal-todo-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-personal-todo-body{--todo-edge-padding:16px;display:flex;flex:1;flex-direction:column;min-height:0;gap:8px;padding:12px 16px 16px}
.dsh-personal-todo-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:8px;min-width:0}
.dsh-personal-todo-new{--dsw-alias-button-primary-fill:var(--dsw-alias-brand-primary-new-colorprimary-new-color);--dsw-alias-button-primary-hover:color-mix(in srgb,var(--dsw-alias-brand-primary-new-colorprimary-new-color) 88%,black);--dsw-alias-label-primary-foreground:#fff}
.dsh-personal-todo-toolbar+.dsh-personal-todo-status-row{margin-top:8px}
.dsh-personal-todo-status-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.dsh-personal-todo-tabs{display:flex;flex:0 1 auto;gap:4px;min-width:0;padding:3px;border-radius:16px;background:var(--dsw-alias-interactive-bg-hover-solid);overflow-x:auto;scrollbar-width:none}.dsh-personal-todo-tabs::-webkit-scrollbar{display:none}
.dsh-personal-todo-tab{display:inline-flex;flex:none;align-items:center;gap:5px;border:0;border-radius:13px;padding:5px 10px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}
.dsh-personal-todo-tab[data-active=true]{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
.dsh-personal-todo-tab-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;background:var(--dsw-alias-fill-l2);color:inherit;font-size:11px;line-height:18px}
.dsh-personal-todo-more-trigger{display:inline-flex;flex:none;align-items:center;justify-content:center;box-sizing:border-box;width:34px;height:34px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:0;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap}.dsh-personal-todo-more-trigger:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-personal-todo-more-trigger[data-active=true]{border-color:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary)}
.dsh-personal-todo-workspace{display:flex;flex:1;min-height:0;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden}
.dsh-personal-todo-workspace[data-has-selection=false]{border:0;border-radius:0}
.dsh-personal-todo-workspace[data-has-selection=true] .dsh-personal-todo-list{display:none}.dsh-personal-todo-workspace[data-has-selection=false] .dsh-personal-todo-detail-pane{display:none}
.dsh-personal-todo-list{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column;gap:8px;overflow:auto;padding:12px 2px;background:transparent}
.dsh-personal-todo-assignee-group{display:flex;flex-direction:column;gap:8px}.dsh-personal-todo-assignee-group+.dsh-personal-todo-assignee-group{margin-top:16px}
.dsh-personal-todo-assignee-heading{display:flex;align-items:center;gap:8px;margin:0;padding:0 2px 4px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:500}.dsh-personal-todo-assignee-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:10px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:400}
.dsh-personal-todo-item{display:flex;flex-direction:column;min-width:0;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}.dsh-personal-todo-item:hover{border-color:var(--dsw-alias-border-l3)}
.dsh-personal-todo-item[data-selected=true]{border-color:var(--dsw-alias-button-primary-fill)}
.dsh-personal-todo-select{display:block;box-sizing:border-box;width:100%;padding:14px;border:0;background:transparent;text-align:left;cursor:pointer;color:inherit}
.dsh-personal-todo-item h3,.dsh-personal-todo-detail h2,.dsh-personal-todo-detail h3{margin:0;color:var(--dsw-alias-label-primary);font-weight:500;overflow-wrap:anywhere}
.dsh-personal-todo-item h3{font-size:14px;line-height:22px;font-weight:600}.dsh-personal-todo-card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.dsh-personal-todo-card-heading svg{flex:none;margin-top:3px;color:var(--dsw-alias-label-tertiary)}.dsh-personal-todo-select:hover .dsh-personal-todo-card-heading svg{color:var(--dsw-alias-label-primary)}.dsh-personal-todo-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color);outline-offset:-3px;border-radius:12px}.dsh-personal-todo-item .dsh-personal-todo-meta{flex:1;min-width:0;margin:0;font-size:11px;gap:6px}.dsh-personal-todo-item .dsh-personal-todo-badge{display:inline-flex;align-items:center;gap:4px;max-width:100%;box-sizing:border-box;padding:3px 6px;line-height:16px;background:var(--dsw-alias-interactive-bg-hover-solid)}.dsh-personal-todo-item .dsh-personal-todo-badge svg{flex:none}.dsh-personal-todo-tag-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-personal-todo-detail h2{font-size:18px}.dsh-personal-todo-detail h3{font-size:13px;margin-top:16px}
.dsh-personal-todo-item p,.dsh-personal-todo-detail p{margin:5px 0 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;white-space:pre-wrap;overflow-wrap:anywhere}
.dsh-personal-todo-item p{margin-top:8px;display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;white-space:normal}
.dsh-personal-todo-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.dsh-personal-todo-badge{display:inline-flex;padding:2px 7px;border-radius:10px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-secondary)}

.dsh-personal-todo-item .dsh-personal-todo-badge[data-priority]{font-weight:500;white-space:nowrap}.dsh-personal-todo-item .dsh-personal-todo-badge[data-priority=high]{color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,var(--dsw-alias-bg-layer-1))}.dsh-personal-todo-item .dsh-personal-todo-badge[data-priority=medium]{color:var(--dsw-alias-state-warn-label);background:color-mix(in srgb,var(--dsw-alias-state-warn-label) 10%,var(--dsw-alias-bg-layer-1))}.dsh-personal-todo-item .dsh-personal-todo-badge[data-priority=low]{color:var(--dsw-alias-label-secondary)}
.dsh-personal-todo-card-footer{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding:0 14px 14px}.dsh-personal-todo-card-footer>button{flex:none;margin-left:auto}
.dsh-personal-todo-workspace[data-empty=true]{border-color:transparent}.dsh-personal-todo-workspace[data-empty=true] .dsh-personal-todo-list{background:transparent}
.dsh-personal-todo-empty-state{display:flex;flex:1;min-height:240px;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px 20px;text-align:center}.dsh-personal-todo-empty-icon{display:grid;place-items:center;width:64px;height:64px;margin-bottom:8px;border-radius:16px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}.dsh-personal-todo-empty-state h3{margin:0;color:var(--dsw-alias-label-primary);font-size:15px;line-height:22px;font-weight:500}.dsh-personal-todo-empty-state p{max-width:260px;margin:0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:21px}.dsh-personal-todo-empty-state button{margin-top:8px}
.dsh-personal-todo-empty{padding:48px 16px;text-align:center;color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-error{padding:10px 12px;border-radius:10px;background:var(--dsw-alias-state-error-secondary);color:var(--dsw-alias-label-error);font-size:13px}
.dsh-personal-todo-more{align-self:center}.dsh-personal-todo-detail-pane{display:flex;flex:1;flex-direction:column;min-width:0;min-height:0}.dsh-personal-todo-detail{min-width:0;min-height:0;flex:1;overflow:auto;padding:18px 20px}
.dsh-personal-todo-workspace[data-detail=true]{border:0;border-radius:0;margin-right:calc(-1 * var(--todo-edge-padding))}.dsh-personal-todo-workspace[data-detail=true] .dsh-personal-todo-commandbar{margin-right:var(--todo-edge-padding)}.dsh-personal-todo-workspace[data-detail=true] .dsh-personal-todo-detail{padding:12px calc(var(--todo-edge-padding) + 4px) 20px 4px;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l3) transparent}.dsh-personal-todo-detail-section{margin-top:24px;padding-top:20px;border-top:1px solid var(--dsw-alias-border-l2)}.dsh-personal-todo-detail .dsh-personal-todo-detail-section h3{margin:0 0 10px;font-weight:600}.dsh-personal-todo-detail-summary{display:flex;min-width:0;width:100%;flex-direction:column;gap:16px}.dsh-personal-todo-detail-summary h2{line-height:28px}.dsh-personal-todo-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;width:100%}.dsh-personal-todo-title-row h2{flex:1;min-width:0}.dsh-personal-todo-title-row .dsh-personal-todo-badge{flex:none;white-space:nowrap;font-size:12px;line-height:20px}.dsh-personal-todo-detail .dsh-personal-todo-meta{gap:12px 16px;margin-top:0;line-height:22px}.dsh-personal-todo-detail .dsh-personal-todo-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;background:var(--dsw-alias-interactive-bg-hover-solid)}.dsh-personal-todo-owner{display:inline-flex;align-items:center;gap:6px;min-width:0;overflow-wrap:anywhere}.dsh-personal-todo-owner svg,.dsh-personal-todo-detail .dsh-personal-todo-badge svg{flex:none}.dsh-personal-todo-detail-actions .dsh-personal-todo-delete{color:var(--dsw-alias-state-error-primary)}.dsh-personal-todo-session-empty{display:flex;align-items:flex-start;gap:10px;color:var(--dsw-alias-label-secondary)}.dsh-personal-todo-session-empty svg{flex:none;margin-top:2px}.dsh-personal-todo-detail .dsh-personal-todo-session-empty p{margin:0;font-size:12px}.dsh-personal-todo-event>svg{margin-top:2px;color:var(--dsw-alias-label-tertiary)}.dsh-personal-todo-event-content{display:flex;min-width:0;flex-direction:column;gap:4px;overflow-wrap:anywhere}.dsh-personal-todo-event-content time{font-size:11px;line-height:18px}.dsh-personal-todo-detail .dsh-personal-todo-event-content p{margin:0;font-size:12px}
.dsh-personal-todo-detail-header{display:flex;align-items:flex-start;flex-direction:column;gap:20px}.dsh-personal-todo-detail-actions{display:flex;gap:6px;flex-wrap:wrap}
.dsh-personal-todo-heading-row{display:flex;align-items:center;gap:8px}.dsh-personal-todo-back{display:grid;place-items:center;flex:none;width:28px;height:28px;margin-left:-4px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}.dsh-personal-todo-back:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-personal-todo-back:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color);outline-offset:2px}.dsh-personal-todo-detail-summary+.dsh-personal-todo-deadline{margin-top:-12px}
.dsh-personal-todo-deadline{display:grid;grid-template-columns:14px auto minmax(0,1fr);align-items:start;gap:10px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}.dsh-personal-todo-deadline svg{flex:none;margin-top:3px}.dsh-personal-todo-deadline time{overflow-wrap:anywhere;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.dsh-personal-todo-callout{margin-top:14px;padding:12px;border-radius:12px;background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2)}
.dsh-personal-todo-review{margin-top:24px;padding-top:20px;border-top:1px solid var(--dsw-alias-border-l2)}.dsh-personal-todo-detail .dsh-personal-todo-review h3{display:flex;align-items:center;gap:8px;margin:0 0 16px;font-size:14px;line-height:22px;font-weight:600}
.dsh-personal-todo-review dl{display:flex;flex-direction:column;gap:20px;margin:0;font-size:13px;line-height:22px}.dsh-personal-todo-review dt{display:flex;align-items:center;gap:6px;margin-bottom:6px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}.dsh-personal-todo-review dd{margin:0;color:var(--dsw-alias-label-primary);white-space:pre-wrap;overflow-wrap:anywhere}.dsh-personal-todo-review svg{flex:none}
.dsh-personal-todo-review-actions{border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}.dsh-personal-todo-review-action-heading{display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:18px}.dsh-personal-todo-review-action-heading strong{color:var(--dsw-alias-label-primary);font-weight:600}.dsh-personal-todo-review-action-heading span{color:var(--dsw-alias-label-secondary)}.dsh-personal-todo-review-actions.dsh-personal-todo-commandbar{padding:14px 4px 0;max-height:45%;overflow:auto}.dsh-personal-todo-review-actions.dsh-personal-todo-commandbar textarea{flex:none;min-height:64px;height:64px;max-height:120px;background:var(--dsw-alias-bg-layer-1)}.dsh-personal-todo-review-actions textarea::placeholder{color:var(--dsw-alias-label-tertiary);opacity:1}.dsh-personal-todo-review-actions textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color);outline-offset:1px}.dsh-personal-todo-review-actions .dsh-personal-todo-commandbar-actions{flex-wrap:wrap}
.dsh-personal-todo-commandbar{display:flex;align-items:stretch;flex-direction:column;gap:10px;flex:none;padding:10px 20px 12px}.dsh-personal-todo-commandbar textarea{min-width:0;min-height:72px;flex:1}.dsh-personal-todo-commandbar-actions{display:flex;justify-content:flex-end;gap:8px;flex:none}
.dsh-personal-todo-timeline{display:flex;flex-direction:column;gap:16px;margin-top:8px}.dsh-personal-todo-event{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px;align-items:start;font-size:12px;color:var(--dsw-alias-label-secondary)}.dsh-personal-todo-event time{color:var(--dsw-alias-label-tertiary)}
.dsh-personal-todo-session{display:flex;box-sizing:border-box;width:100%;justify-content:space-between;align-items:center;gap:12px;margin-top:8px;padding:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}.dsh-personal-todo-session:hover{background:var(--dsw-alias-interactive-bg-hover-solid);border-color:var(--dsw-alias-border-l3)}.dsh-personal-todo-session:disabled{cursor:default;opacity:.5}.dsh-personal-todo-session:focus-visible{outline:2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color);outline-offset:2px}.dsh-personal-todo-session-icon{display:grid;flex:none;place-items:center;width:32px;height:32px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-secondary)}.dsh-personal-todo-session-name{flex:1;min-width:0;overflow-wrap:anywhere;line-height:20px;font-weight:500}.dsh-personal-todo-session-open{display:inline-flex;flex:none;align-items:center;gap:4px;color:var(--dsw-alias-label-secondary);font-size:12px}

.dsh-personal-todo-workspace[data-form=true]{border:0;border-radius:0}.dsh-personal-todo-workspace[data-form=true] .dsh-personal-todo-detail{padding:8px 4px 20px}
.dsh-personal-todo-form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-content:start;gap:16px 12px}.dsh-personal-todo-field{display:flex;min-width:0;flex-direction:column;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-personal-todo-field[data-wide=true]{grid-column:1/-1}
.dsh-personal-todo-field textarea,.dsh-personal-todo-commandbar textarea{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);padding:9px 11px;font:inherit;font-size:13px;resize:vertical}.dsh-personal-todo-field textarea{min-height:100px}
.dsh-personal-todo-form input,.dsh-personal-todo-form select,.dsh-personal-todo-form textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);padding:10px 12px;font:inherit;font-size:13px;line-height:20px;outline:none}.dsh-personal-todo-form input,.dsh-personal-todo-form select{height:40px}.dsh-personal-todo-form textarea{min-height:112px;resize:vertical}.dsh-personal-todo-form input::placeholder,.dsh-personal-todo-form textarea::placeholder{color:var(--dsw-alias-label-tertiary);opacity:1}.dsh-personal-todo-form input:focus,.dsh-personal-todo-form select:focus,.dsh-personal-todo-form textarea:focus{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary-new-colorprimary-new-color) 16%,transparent)}
.dsh-personal-todo-form-actions{display:flex;flex:none;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:16px 4px 0;border-top:1px solid var(--dsw-alias-border-l2)}.dsh-personal-todo-small-dialog{width:min(480px,calc(100vw - 32px))}
.dsh-personal-todo-canvas .dsh-personal-todo-badge[data-status]{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--todo-status-color,var(--dsw-alias-label-secondary)) 16%,var(--dsw-alias-bg-layer-1))}.dsh-personal-todo-badge[data-status=in_progress]{--todo-status-color:var(--dsw-alias-state-business-primary)}.dsh-personal-todo-badge[data-status=blocked]{--todo-status-color:var(--dsw-alias-state-warn-primary)}.dsh-personal-todo-badge[data-status=in_review]{--todo-status-color:#8b5cf6}.dsh-personal-todo-badge[data-status=completed]{--todo-status-color:var(--dsw-alias-state-success-primary)}.dsh-personal-todo-badge[data-status=cancelled]{--todo-status-color:var(--dsw-alias-state-error-primary)}
@media(max-width:800px){.dsh-personal-todo-canvas{top:4px;right:4px;bottom:4px;max-width:calc(100% - 8px)}.dsh-personal-todo-canvas-header{padding:14px}.dsh-personal-todo-canvas-heading p{display:none}.dsh-personal-todo-body{--todo-edge-padding:10px;padding:10px}.dsh-personal-todo-detail{padding:14px}.dsh-personal-todo-commandbar{padding:10px 14px 12px}}
@media(max-width:380px){.dsh-personal-todo-form{grid-template-columns:minmax(0,1fr)}}
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
const STATUS_ICONS = {
  pending: CircleDashed,
  in_progress: LoaderCircle,
  blocked: MessageCircle,
  in_review: ClipboardCheck,
  completed: CircleCheck,
  cancelled: CircleX,
} satisfies Record<TodoStatus, typeof CircleDot>
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

/** 打开待办面板并提示待处理事项的侧栏入口。 */
export function PersonalTodoTrigger({ wide, t, list, canvas, openCanvas, closeCanvas }: PersonalTodoTriggerProps) {
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
        icon={<ListTodo size={16} aria-hidden="true" />}
        aria-label={triggerLabel}
        title={triggerLabel}
        data-wide={wide}
        aria-expanded={snapshot.open}
        onClick={snapshot.open ? closeCanvas : openCanvas}
      >
        {wide ? <span>{t('trigger.label')}</span> : null}
        {snapshot.attentionCount > 0 && (
          <span className="dsh-personal-todo-attention" aria-hidden="true">{snapshot.attentionCount}</span>
        )}
      </Button>
    </>
  )
}

/** 悬浮在 shell.overlay 图层中的个人待办抽屉。 */
export function PersonalTodoCanvas(props: PersonalTodoCanvasProps) {
  const {
    t, canvas, list, get, create, update, start, reply, approve, archive, restore,
    requestChanges, delete: deleteTodo, openSession, closeCanvas,
  } = props
  const snapshot = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot)
  const [view, setView] = useState<View>('pending')
  const [todos, setTodos] = useState<Todo[]>([])
  const [result, setResult] = useState<TodoListResult>()
  const [selectedId, setSelectedId] = useState<string>()
  const selectedIdRef = useRef<string>()
  const [detail, setDetail] = useState<TodoDetail>()
  const [moreOpen, setMoreOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [form, setForm] = useState<FormState>()
  const [confirming, setConfirming] = useState<Todo>()
  const [replyText, setReplyText] = useState('')
  const [feedback, setFeedback] = useState('')
  const controllers = useRef(new Set<AbortController>())
  const insidePointer = useRef<Event>()
  selectedIdRef.current = selectedId

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
  }, [canvas, list, view])

  const refresh = useCallback(async (silent = false): Promise<void> => {
    await Promise.all([
      fetchPage(0, false, silent),
      selectedId === undefined ? Promise.resolve() : fetchDetail(selectedId),
    ])
  }, [fetchDetail, fetchPage, selectedId])

  useEffect(() => {
    if (snapshot.open) void fetchPage(0)
  }, [fetchPage, snapshot.open])

  useEffect(() => {
    if (!snapshot.open || !todos.some(todo => todo.status === 'in_progress')) return
    const interval = window.setInterval(() => { void refresh(true) }, ACTIVE_REFRESH_MS)
    return () => { window.clearInterval(interval) }
  }, [refresh, snapshot.open, todos])

  useEffect(() => () => {
    for (const controller of controllers.current) controller.abort()
    controllers.current.clear()
  }, [])

  const resetPanel = useCallback((): void => {
    for (const controller of controllers.current) controller.abort()
    controllers.current.clear()
    setBusy(false)
    setForm(undefined)
    setConfirming(undefined)
    setMoreOpen(false)
    setSelectedId(undefined)
    setDetail(undefined)
  }, [])

  const close = useCallback((): void => {
    resetPanel()
    closeCanvas()
  }, [closeCanvas, resetPanel])

  useEffect(() => {
    if (!snapshot.open) {
      resetPanel()
      return
    }
    const onOutsidePointerDown = (event: PointerEvent): void => {
      // React 捕获阶段也会覆盖通过 Portal 渲染的抽屉菜单和对话框。
      if (insidePointer.current === event) return
      if (event.target instanceof Element && event.target.closest('.dsh-personal-todo-trigger') !== null) return
      close()
    }
    document.addEventListener('pointerdown', onOutsidePointerDown)
    return () => { document.removeEventListener('pointerdown', onOutsidePointerDown) }
  }, [close, resetPanel, snapshot.open])

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

  const copyTodo = (source: Todo): void => {
    if (busy) return
    let copied: Todo | undefined
    void mutate(async (signal) => {
      // 仅传入元信息，由创建接口初始化独立的状态和历史。
      copied = await create({
        title: source.title,
        notes: source.notes,
        assignee: source.assignee,
        priority: source.priority,
        dueAt: source.dueAt,
        tags: [...source.tags],
      }, signal)
      signal.throwIfAborted()
    }, false).then((saved) => {
      if (!saved || copied === undefined) return
      setView('pending')
      selectTodo(copied.id)
    })
  }

  const saveForm = (startAfterCreate: boolean): void => {
    if (busy || form === undefined || form.title.trim() === '') return
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
      return startAfterCreate ? start(created.id, signal) : created
    }).then((saved) => {
      if (!saved) return
      setForm(undefined)
      if (creating) setView(startAfterCreate ? 'in_progress' : 'pending')
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

  const openCreateForm = (): void => {
    setSelectedId(undefined)
    setDetail(undefined)
    setForm({ ...EMPTY_FORM })
  }

  const EmptyIcon = view === 'archived' ? Archive : ClipboardList
  const emptyMessage = view === 'archived'
    ? t('state.emptyArchived')
    : t('state.emptyStatus', { status: statusLabel(view) })
  const DetailStatusIcon = STATUS_ICONS[detail?.todo.status ?? 'pending']
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
    <div style={{ display: 'contents' }} onPointerDownCapture={event => { insidePointer.current = event.nativeEvent }}>
      <style>{CSS}</style>
      <section
        className="dsh-personal-todo-canvas"
        aria-label={t('panel.title')}
      >
        <header className="dsh-personal-todo-canvas-header">
          <div className="dsh-personal-todo-canvas-heading">
            <div className="dsh-personal-todo-heading-row">
              {selectedId !== undefined && form === undefined && <button type="button" className="dsh-personal-todo-back" aria-label={t('action.back')} title={t('action.back')} onClick={() => { setSelectedId(undefined); setDetail(undefined) }}><ArrowLeft size={18} aria-hidden="true" /></button>}
              <h2>{form === undefined ? selectedId === undefined ? t('panel.title') : t('detail.title') : form.id === undefined ? t('action.add') : t('action.edit')}</h2>
            </div>
            {(selectedId === undefined || form !== undefined) && <p>{form === undefined ? t('panel.description') : form.id === undefined ? t('form.description') : t('form.editDescription')}</p>}
          </div>
          <button type="button" className="dsh-personal-todo-close" aria-label={t('panel.close')} onClick={close}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="dsh-personal-todo-body">
          {form === undefined && selectedId === undefined && <>
          <div className="dsh-personal-todo-toolbar">
            <Button className="dsh-personal-todo-new" size="md" variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreateForm}>{t('action.add')}</Button>
          </div>
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
                  aria-label={t('action.more')}
                  title={t('action.more')}
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                  data-active={isMoreView(view)}
                  onClick={() => { setMoreOpen(current => !current) }}
                >
                  <Ellipsis size={16} aria-hidden="true" />
                </button>
              )}
            />
          </div>
          </>}
          {error !== undefined && <div className="dsh-personal-todo-error" role="alert">{t('state.error', { message: error })}</div>}
          <div className="dsh-personal-todo-workspace" data-detail={selectedId !== undefined && form === undefined} data-form={form !== undefined} data-empty={todos.length === 0 && selectedId === undefined && form === undefined} data-has-selection={selectedId !== undefined || form !== undefined}>
          <div className="dsh-personal-todo-list">
            {busy && todos.length === 0 && <div className="dsh-personal-todo-empty">{t('state.loading')}</div>}
            {!busy && error === undefined && todos.length === 0 && (
              <div className="dsh-personal-todo-empty-state">
                <span className="dsh-personal-todo-empty-icon"><EmptyIcon size={28} strokeWidth={1.5} aria-hidden="true" /></span>
                <h3>{emptyMessage}</h3>
                <p>{t(`empty.${view}`)}</p>
                {view === 'pending' && <Button size="sm" variant="outline" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreateForm}>{t('empty.create')}</Button>}
              </div>
            )}
            {assigneeGroups.map((group, groupIndex) => (
              <section className="dsh-personal-todo-assignee-group" aria-labelledby={`todo-assignee-group-${String(groupIndex)}`} key={group.key}>
                <h3 className="dsh-personal-todo-assignee-heading" id={`todo-assignee-group-${String(groupIndex)}`}>
                  <UserRound size={14} aria-hidden="true" />
                  <span>{group.assignee ?? t('assignee.unassigned')}</span>
                  <span className="dsh-personal-todo-assignee-count">{group.todos.length}</span>
                </h3>
                {group.todos.map(todo => (
                  <article className="dsh-personal-todo-item" data-selected={todo.id === selectedId} key={todo.id}>
                    <button type="button" className="dsh-personal-todo-select" onClick={() => { selectTodo(todo.id) }}>
                      <div className="dsh-personal-todo-card-heading"><h3>{todo.title}</h3><ChevronRight size={16} aria-hidden="true" /></div>
                      {(todo.latestSummary ?? todo.notes) !== null && <p>{todo.latestSummary ?? todo.notes}</p>}
                    </button>
                    <div className="dsh-personal-todo-card-footer">
                      <div className="dsh-personal-todo-meta">
                        {view === 'archived' && <span className="dsh-personal-todo-badge" data-status={todo.status}><CircleDot size={12} aria-hidden="true" />{statusLabel(todo.status)}</span>}
                        {todo.priority !== 'none' && <span className="dsh-personal-todo-badge" data-priority={todo.priority}>{todo.priority === 'high' ? <ChevronsUp size={14} aria-hidden="true" /> : todo.priority === 'medium' ? <Equal size={14} aria-hidden="true" /> : <ArrowDown size={14} aria-hidden="true" />}{priorityLabel(todo.priority)}</span>}
                        {todo.tags.map(tag => <span className="dsh-personal-todo-badge" key={tag} title={tag}><Tag size={12} aria-hidden="true" /><span className="dsh-personal-todo-tag-text">{tag}</span></span>)}
                      </div>
                      {todo.status === 'pending' && <Button size="sm" variant="outline" icon={<Play size={14} aria-hidden="true" />} disabled={busy} onClick={() => { void mutate(signal => start(todo.id, signal)) }}>{t('action.start')}</Button>}
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
              <div className="dsh-personal-todo-form">
                <label className="dsh-personal-todo-field" data-wide="true">{t('field.title')}<input autoFocus required value={form.title} maxLength={200} placeholder={t('field.titlePlaceholder')} onChange={event => { setForm({ ...form, title: event.target.value }) }} /></label>
                <label className="dsh-personal-todo-field" data-wide="true">{t('field.notes')}<textarea value={form.notes} maxLength={10_000} placeholder={t('field.notesPlaceholder')} onChange={event => { setForm({ ...form, notes: event.target.value }) }} /></label>
                <label className="dsh-personal-todo-field">{t('field.assignee')}<input value={form.assignee} maxLength={100} placeholder={t('field.assigneePlaceholder')} onChange={event => { setForm({ ...form, assignee: event.target.value }) }} /></label>
                <label className="dsh-personal-todo-field">{t('field.priority')}<select value={form.priority} onChange={event => { setForm({ ...form, priority: event.target.value as TodoPriority }) }}><option value="none">{t('priority.none')}</option><option value="low">{t('priority.low')}</option><option value="medium">{t('priority.medium')}</option><option value="high">{t('priority.high')}</option></select></label>
                <label className="dsh-personal-todo-field" data-wide="true">{t('field.dueAt')}<input type="datetime-local" value={form.dueLocal} onChange={event => { setForm({ ...form, dueLocal: event.target.value }) }} /></label>
                <label className="dsh-personal-todo-field" data-wide="true">{t('field.tags')}<input value={form.tags} placeholder={t('field.tagsPlaceholder')} onChange={event => { setForm({ ...form, tags: event.target.value }) }} /></label>

              </div>
            </>}
            {form === undefined && selectedId === undefined && <div className="dsh-personal-todo-empty">{t('detail.empty')}</div>}
            {form === undefined && selectedId !== undefined && detail === undefined && <div className="dsh-personal-todo-empty">{t('state.loadingDetail')}</div>}
            {form === undefined && detail !== undefined && detail.todo.id === selectedId && <>
              <div className="dsh-personal-todo-detail-header">
                <div className="dsh-personal-todo-detail-summary"><div className="dsh-personal-todo-title-row"><h2>{detail.todo.title}</h2><span className="dsh-personal-todo-badge" data-status={detail.todo.status}><DetailStatusIcon size={14} aria-hidden="true" />{statusLabel(detail.todo.status)}</span></div><div className="dsh-personal-todo-meta"><span className="dsh-personal-todo-owner"><UserRound size={14} aria-hidden="true" />{t('meta.assignee', { assignee: detail.todo.assignee ?? t('assignee.unassigned') })}</span>{detail.todo.reviewRound > 0 && <span>{t('meta.reviewRound', { round: detail.todo.reviewRound })}</span>}</div></div>
                <div className="dsh-personal-todo-deadline"><CalendarDays size={14} aria-hidden="true" /><span>{t('field.dueAt')}</span>{detail.todo.dueAt === null ? <span>{t('meta.noDueDate')}</span> : <time dateTime={detail.todo.dueAt}>{new Date(detail.todo.dueAt).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</time>}</div>
                <div className="dsh-personal-todo-detail-actions">
                  {detail.todo.status === 'pending' && <Button className="dsh-personal-todo-new" size="sm" variant="primary" icon={<Play size={14} aria-hidden="true" />} disabled={busy} onClick={() => { void mutate(signal => start(detail.todo.id, signal)) }}>{t('action.start')}</Button>}
                  {detail.todo.primarySessionId !== null && <Button size="sm" variant="primary" onClick={() => { openConversation(detail.todo.primarySessionId as string, null) }}>{t('action.openConversation')}</Button>}
                  <Button size="sm" variant="ghost" icon={<Pencil size={16} aria-hidden="true" />} disabled={busy} onClick={() => { setForm(formOf(detail.todo)) }}>{t('action.edit')}</Button>
                  <Button size="sm" variant="ghost" icon={<Copy size={16} aria-hidden="true" />} disabled={busy} onClick={() => { copyTodo(detail.todo) }}>{t('action.copy')}</Button>
                  {detail.todo.archivedAt === null && <Button size="sm" variant="ghost" icon={<Archive size={14} aria-hidden="true" />} disabled={busy} onClick={() => {
                    void mutate(signal => archive(detail.todo.id, signal), false).then((saved) => {
                      if (saved) { setSelectedId(undefined); setDetail(undefined) }
                    })
                  }}>{t('action.archive')}</Button>}
                  {detail.todo.archivedAt !== null && <Button size="sm" variant="ghost" icon={<Undo2 size={14} aria-hidden="true" />} disabled={busy} onClick={() => {
                    void mutate(signal => restore(detail.todo.id, signal), false).then((saved) => {
                      if (saved) { setSelectedId(undefined); setDetail(undefined) }
                    })
                  }}>{t('action.restore')}</Button>}
                  {(detail.todo.archivedAt !== null || detail.todo.status === 'pending' || detail.todo.status === 'completed' || detail.todo.status === 'cancelled') && <Button className="dsh-personal-todo-delete" size="sm" variant="ghost" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => { setConfirming(detail.todo) }}>{t('action.delete')}</Button>}
                </div>
              </div>
              {detail.todo.status === 'in_review' && selectedRun !== undefined && <section className="dsh-personal-todo-review">
                <h3><ClipboardCheck size={18} aria-hidden="true" />{t('detail.review')}</h3>
                <dl>
                  <div><dt><ClipboardList size={14} aria-hidden="true" />{t('review.summary')}</dt><dd>{selectedRun.resultSummary ?? '—'}</dd></div>
                  <div><dt><CircleCheck size={14} aria-hidden="true" />{t('review.verification')}</dt><dd>{selectedRun.verification ?? '—'}</dd></div>
                  <div><dt><Flag size={14} aria-hidden="true" />{t('review.risk')}</dt><dd>{selectedRun.risk ?? '—'}</dd></div>
                </dl>
              </section>}
              {detail.todo.notes !== null && <section className="dsh-personal-todo-detail-section"><h3>{t('field.notes')}</h3><p>{detail.todo.notes}</p></section>}
              {detail.todo.archivedAt !== null && <div className="dsh-personal-todo-meta"><span>{t('meta.archived', { date: new Date(detail.todo.archivedAt).toLocaleString() })}</span></div>}
              {detail.todo.blockedReason !== null && <div className="dsh-personal-todo-callout"><strong>{t('detail.waitingForYou')}</strong><p>{detail.todo.blockedReason}</p></div>}

              <section className="dsh-personal-todo-detail-section"><h3>{t('detail.conversations')}</h3>
              {detail.sessions.length === 0 ? <div className="dsh-personal-todo-session-empty"><MessageSquare size={18} aria-hidden="true" /><p>{t('detail.noConversations')}</p></div> : detail.sessions.map((session, index) => <button type="button" className="dsh-personal-todo-session" key={session.sessionId} aria-label={t('action.openConversation')} aria-describedby={`personal-todo-session-${index}`} disabled={busy} onClick={() => { openConversation(session.sessionId, session.parentSessionId) }}>
                <span className="dsh-personal-todo-session-icon">{session.role === 'primary' ? <MessageSquare size={18} aria-hidden="true" /> : <GitBranch size={18} aria-hidden="true" />}</span>
                <span className="dsh-personal-todo-session-name" id={`personal-todo-session-${index}`}>{sessionLabel(session, detail.sessions)}</span>
                <span className="dsh-personal-todo-session-open" aria-hidden="true">{t('action.openConversation')}<ChevronRight size={16} /></span>
              </button>)}
              </section>
              <section className="dsh-personal-todo-detail-section"><h3>{t('detail.activity')}</h3>
              <div className="dsh-personal-todo-timeline">{detail.events.map(event => <div className="dsh-personal-todo-event" key={event.id}><CircleDot size={14} aria-hidden="true" /><div className="dsh-personal-todo-event-content"><strong>{eventLabel(event.type)}</strong>{event.message !== null && <p>{event.message}</p>}<time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></div></div>)}</div>
              </section>
            </>}
            </section>
            {form !== undefined && <div className="dsh-personal-todo-form-actions">
              <Button variant="outline" onClick={() => { setForm(undefined) }}>{t('action.cancel')}</Button>
              {form.id === undefined && <Button variant="outline" disabled={busy || form.title.trim() === ''} onClick={() => { saveForm(false) }}>{t('action.createOnly')}</Button>}
              <Button className="dsh-personal-todo-new" variant="primary" disabled={busy || form.title.trim() === ''} onClick={() => { saveForm(form.id === undefined) }}>{form.id === undefined ? t('action.create') : t('action.save')}</Button>
            </div>}
            {form === undefined && detail !== undefined && detail.todo.id === selectedId && detail.todo.status === 'blocked' && <div className="dsh-personal-todo-commandbar"><textarea aria-label={t('reply.aria')} value={replyText} onChange={event => { setReplyText(event.target.value) }} placeholder={t('reply.placeholder')} /><div className="dsh-personal-todo-commandbar-actions"><Button variant="primary" disabled={busy || replyText.trim() === ''} onClick={() => { void mutate(signal => reply({ id: detail.todo.id, message: replyText }, signal)).then(saved => { if (saved) setReplyText('') }) }}>{t('action.reply')}</Button></div></div>}
            {form === undefined && detail !== undefined && detail.todo.id === selectedId && detail.todo.status === 'in_review' && <section className="dsh-personal-todo-commandbar dsh-personal-todo-review-actions" aria-label={t('review.actions')}>
              <div className="dsh-personal-todo-review-action-heading"><strong>{t('review.actions')}</strong><span>{t('review.actionHint')}</span></div>
              <textarea aria-label={t('feedback.aria')} value={feedback} onChange={event => { setFeedback(event.target.value) }} placeholder={t('feedback.placeholder')} />
              <div className="dsh-personal-todo-commandbar-actions">
                <Button variant="outline" icon={<MessageSquare size={16} aria-hidden="true" />} disabled={busy || feedback.trim() === ''} onClick={() => { void mutate(signal => requestChanges({ id: detail.todo.id, feedback }, signal)).then(saved => { if (saved) setFeedback('') }) }}>{t('action.requestChanges')}</Button>
                <Button className="dsh-personal-todo-new" variant="primary" icon={<CircleCheck size={16} aria-hidden="true" />} disabled={busy} onClick={() => { void mutate(signal => approve(detail.todo.id, signal)) }}>{t('action.approve')}</Button>
              </div>
            </section>}
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
    </div>
  )
}
