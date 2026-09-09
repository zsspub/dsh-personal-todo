import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore, } from 'react';
import { Button, Menu, Modal, } from '@deepseek-ai/dsh-client-ui-primitives';
import { Archive, ArrowDown, ArrowLeft, CalendarDays, ChevronRight, ChevronsUp, CircleCheck, CircleDashed, CircleDot, CircleX, ClipboardCheck, ClipboardList, Ellipsis, Equal, Flag, GitBranch, ListTodo, LoaderCircle, MessageCircle, MessageSquare, Pencil, Play, Plus, Tag, Trash2, Undo2, UserRound, X } from 'lucide-react';
import { TODO_STATUSES } from "../types.js";
// The slot renderer anchors list slots with inline `display: contents`. A wide
// sidebar reifies that wrapper so every footer action occupies its own row.
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
`;
const EMPTY_FORM = { title: '', notes: '', assignee: '', priority: 'none', dueLocal: '', tags: '' };
const ACTIVE_REFRESH_MS = 2_000;
const STATUS_ICONS = {
    pending: CircleDashed,
    in_progress: LoaderCircle,
    blocked: MessageCircle,
    in_review: ClipboardCheck,
    completed: CircleCheck,
    cancelled: CircleX,
};
const PRIMARY_VIEWS = ['pending', 'in_progress', 'blocked', 'in_review'];
const MORE_VIEWS = ['completed', 'cancelled', 'archived'];
function isMoreView(value) {
    return value === 'completed' || value === 'cancelled' || value === 'archived';
}
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
        assignee: todo.assignee ?? '',
        priority: todo.priority,
        dueLocal: localDateTime(todo.dueAt),
        tags: todo.tags.join(', '),
    };
}
function groupByAssignee(todos) {
    const groups = new Map();
    for (const todo of todos) {
        const key = todo.assignee ?? '';
        const group = groups.get(key);
        if (group === undefined)
            groups.set(key, { key, assignee: todo.assignee, todos: [todo] });
        else
            group.todos.push(todo);
    }
    return [...groups.values()].sort((left, right) => {
        if (left.assignee === null)
            return right.assignee === null ? 0 : 1;
        if (right.assignee === null)
            return -1;
        return left.assignee.localeCompare(right.assignee);
    });
}
function dueAt(value) {
    return value === '' ? null : new Date(value).toISOString();
}
function normalizedAssignee(value) {
    const assignee = value.trim();
    return assignee === '' ? null : assignee;
}
/** Sidebar action opening the task Canvas and surfacing attention work. */
export function PersonalTodoTrigger({ wide, t, list, canvas, openCanvas, closeCanvas }) {
    const snapshot = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot);
    useEffect(() => {
        let controller;
        const refresh = () => {
            controller?.abort();
            controller = new AbortController();
            void list({ statuses: ['blocked', 'in_review'], limit: 1 }, controller.signal).then(page => { canvas.setAttentionCount(page.counts.blocked + page.counts.inReview); }, () => undefined);
        };
        refresh();
        const interval = window.setInterval(refresh, ACTIVE_REFRESH_MS);
        return () => {
            window.clearInterval(interval);
            controller?.abort();
        };
    }, [canvas, list]);
    const triggerLabel = snapshot.attentionCount === 0
        ? t('trigger.aria')
        : t('trigger.attention', { count: snapshot.attentionCount });
    return (_jsxs(_Fragment, { children: [_jsx("style", { children: CSS }), _jsxs(Button, { className: "dsh-personal-todo-trigger", variant: "ghost", size: "sm", icon: _jsx(ListTodo, { size: 16, "aria-hidden": "true" }), "aria-label": triggerLabel, title: triggerLabel, "data-wide": wide, "aria-expanded": snapshot.open, onClick: snapshot.open ? closeCanvas : openCanvas, children: [wide ? _jsx("span", { children: t('trigger.label') }) : null, snapshot.attentionCount > 0 && (_jsx("span", { className: "dsh-personal-todo-attention", "aria-hidden": "true", children: snapshot.attentionCount }))] })] }));
}
/** Task-driven personal todo drawer floating in the shell overlay. */
export function PersonalTodoCanvas(props) {
    const { t, canvas, list, get, create, update, start, reply, approve, archive, restore, requestChanges, delete: deleteTodo, openSession, closeCanvas, } = props;
    const snapshot = useSyncExternalStore(canvas.subscribe, canvas.getSnapshot);
    const [view, setView] = useState('pending');
    const [todos, setTodos] = useState([]);
    const [result, setResult] = useState();
    const [selectedId, setSelectedId] = useState();
    const selectedIdRef = useRef();
    const [detail, setDetail] = useState();
    const [moreOpen, setMoreOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState();
    const [form, setForm] = useState();
    const [confirming, setConfirming] = useState();
    const [replyText, setReplyText] = useState('');
    const [feedback, setFeedback] = useState('');
    const controllers = useRef(new Set());
    const insidePointer = useRef();
    selectedIdRef.current = selectedId;
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
    const fetchPage = useCallback(async (offset, append = false, silent = false) => {
        if (!silent)
            setBusy(true);
        setError(undefined);
        try {
            const page = await withController(signal => list({
                statuses: view === 'archived' ? TODO_STATUSES : [view],
                archived: view === 'archived',
                offset,
            }, signal));
            setTodos(current => append ? [...current, ...page.todos] : page.todos.slice());
            setResult(page);
            if (!append && selectedIdRef.current !== undefined
                && !page.todos.some(todo => todo.id === selectedIdRef.current)) {
                setSelectedId(undefined);
                setDetail(undefined);
            }
            canvas.setAttentionCount(page.counts.blocked + page.counts.inReview);
            return page;
        }
        catch (reason) {
            setError(errorText(reason));
            return undefined;
        }
        finally {
            if (!silent)
                setBusy(false);
        }
    }, [canvas, list, view]);
    const refresh = useCallback(async (silent = false) => {
        await Promise.all([
            fetchPage(0, false, silent),
            selectedId === undefined ? Promise.resolve() : fetchDetail(selectedId),
        ]);
    }, [fetchDetail, fetchPage, selectedId]);
    useEffect(() => {
        if (snapshot.open)
            void fetchPage(0);
    }, [fetchPage, snapshot.open]);
    useEffect(() => {
        if (!snapshot.open || !todos.some(todo => todo.status === 'in_progress'))
            return;
        const interval = window.setInterval(() => { void refresh(true); }, ACTIVE_REFRESH_MS);
        return () => { window.clearInterval(interval); };
    }, [refresh, snapshot.open, todos]);
    useEffect(() => () => {
        for (const controller of controllers.current)
            controller.abort();
        controllers.current.clear();
    }, []);
    const resetPanel = useCallback(() => {
        for (const controller of controllers.current)
            controller.abort();
        controllers.current.clear();
        setBusy(false);
        setForm(undefined);
        setConfirming(undefined);
        setMoreOpen(false);
        setSelectedId(undefined);
        setDetail(undefined);
    }, []);
    const close = useCallback(() => {
        resetPanel();
        closeCanvas();
    }, [closeCanvas, resetPanel]);
    useEffect(() => {
        if (!snapshot.open) {
            resetPanel();
            return;
        }
        const onOutsidePointerDown = (event) => {
            // React capture also covers this drawer's portalled menus and dialogs.
            if (insidePointer.current === event)
                return;
            if (event.target instanceof Element && event.target.closest('.dsh-personal-todo-trigger') !== null)
                return;
            close();
        };
        document.addEventListener('pointerdown', onOutsidePointerDown);
        return () => { document.removeEventListener('pointerdown', onOutsidePointerDown); };
    }, [close, resetPanel, snapshot.open]);
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
    const viewLabel = (value) => value === 'archived'
        ? t('tab.archived')
        : statusLabel(value);
    const viewCount = (value) => {
        if (value === 'pending')
            return result?.counts.pending ?? 0;
        if (value === 'in_progress')
            return result?.counts.inProgress ?? 0;
        if (value === 'blocked')
            return result?.counts.blocked ?? 0;
        if (value === 'in_review')
            return result?.counts.inReview ?? 0;
        if (value === 'completed')
            return result?.counts.completed ?? 0;
        if (value === 'cancelled')
            return result?.counts.cancelled ?? 0;
        return result?.counts.archived ?? 0;
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
        setForm(undefined);
        setSelectedId(id);
        setReplyText('');
        setFeedback('');
        void fetchDetail(id);
    };
    const saveForm = (startAfterCreate) => {
        if (busy || form === undefined || form.title.trim() === '')
            return;
        const creating = form.id === undefined;
        const assignee = normalizedAssignee(form.assignee);
        const request = {
            title: form.title,
            notes: form.notes === '' ? null : form.notes,
            assignee,
            priority: form.priority,
            dueAt: dueAt(form.dueLocal),
            tags: tagsFromText(form.tags),
        };
        void mutate(async (signal) => {
            if (form.id !== undefined) {
                const updated = await update({ id: form.id, patch: request }, signal);
                if (updated.assignee !== assignee)
                    throw new Error(t('state.assigneeUpdateMismatch'));
                return updated;
            }
            const created = await create(request, signal);
            return startAfterCreate ? start(created.id, signal) : created;
        }).then((saved) => {
            if (!saved)
                return;
            setForm(undefined);
            if (creating)
                setView(startAfterCreate ? 'in_progress' : 'pending');
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
    const openCreateForm = () => {
        setSelectedId(undefined);
        setDetail(undefined);
        setForm({ ...EMPTY_FORM });
    };
    const EmptyIcon = view === 'archived' ? Archive : ClipboardList;
    const emptyMessage = view === 'archived'
        ? t('state.emptyArchived')
        : t('state.emptyStatus', { status: statusLabel(view) });
    const DetailStatusIcon = STATUS_ICONS[detail?.todo.status ?? 'pending'];
    const selectedRun = detail?.runs[0];
    const assigneeGroups = groupByAssignee(todos);
    const selectView = (value) => {
        setView(value);
        setMoreOpen(false);
        setForm(undefined);
        setSelectedId(undefined);
        setDetail(undefined);
    };
    if (!snapshot.open)
        return null;
    return (_jsxs("div", { style: { display: 'contents' }, onPointerDownCapture: event => { insidePointer.current = event.nativeEvent; }, children: [_jsx("style", { children: CSS }), _jsxs("section", { className: "dsh-personal-todo-canvas", "aria-label": t('panel.title'), children: [_jsxs("header", { className: "dsh-personal-todo-canvas-header", children: [_jsxs("div", { className: "dsh-personal-todo-canvas-heading", children: [_jsxs("div", { className: "dsh-personal-todo-heading-row", children: [selectedId !== undefined && form === undefined && _jsx("button", { type: "button", className: "dsh-personal-todo-back", "aria-label": t('action.back'), title: t('action.back'), onClick: () => { setSelectedId(undefined); setDetail(undefined); }, children: _jsx(ArrowLeft, { size: 18, "aria-hidden": "true" }) }), _jsx("h2", { children: form === undefined ? selectedId === undefined ? t('panel.title') : t('detail.title') : form.id === undefined ? t('action.add') : t('action.edit') })] }), (selectedId === undefined || form !== undefined) && _jsx("p", { children: form === undefined ? t('panel.description') : form.id === undefined ? t('form.description') : t('form.editDescription') })] }), _jsx("button", { type: "button", className: "dsh-personal-todo-close", "aria-label": t('panel.close'), onClick: close, children: _jsx(X, { size: 18, "aria-hidden": "true" }) })] }), _jsxs("div", { className: "dsh-personal-todo-body", children: [form === undefined && selectedId === undefined && _jsxs(_Fragment, { children: [_jsx("div", { className: "dsh-personal-todo-toolbar", children: _jsx(Button, { className: "dsh-personal-todo-new", size: "md", variant: "primary", icon: _jsx(Plus, { size: 16, "aria-hidden": "true" }), onClick: openCreateForm, children: t('action.add') }) }), _jsxs("div", { className: "dsh-personal-todo-status-row", children: [_jsx("div", { className: "dsh-personal-todo-tabs", role: "tablist", "aria-label": t('tab.statuses'), children: PRIMARY_VIEWS.map(value => _jsxs("button", { type: "button", role: "tab", className: "dsh-personal-todo-tab", "aria-selected": view === value, "data-active": view === value, onClick: () => { selectView(value); }, children: [_jsx("span", { children: viewLabel(value) }), _jsx("span", { className: "dsh-personal-todo-tab-count", children: viewCount(value) })] }, value)) }), _jsx(Menu, { open: moreOpen, onClose: () => { setMoreOpen(false); }, items: MORE_VIEWS.map(value => ({
                                                    id: value,
                                                    label: `${viewLabel(value)} ${String(viewCount(value))}`,
                                                })), selectedId: isMoreView(view) ? view : undefined, onSelect: (id) => {
                                                    if (id === 'completed' || id === 'cancelled' || id === 'archived')
                                                        selectView(id);
                                                }, align: "end", portal: true, dense: true, anchor: (_jsx("button", { type: "button", className: "dsh-personal-todo-more-trigger", "aria-label": t('action.more'), title: t('action.more'), "aria-haspopup": "menu", "aria-expanded": moreOpen, "data-active": isMoreView(view), onClick: () => { setMoreOpen(current => !current); }, children: _jsx(Ellipsis, { size: 16, "aria-hidden": "true" }) })) })] })] }), error !== undefined && _jsx("div", { className: "dsh-personal-todo-error", role: "alert", children: t('state.error', { message: error }) }), _jsxs("div", { className: "dsh-personal-todo-workspace", "data-detail": selectedId !== undefined && form === undefined, "data-form": form !== undefined, "data-empty": todos.length === 0 && selectedId === undefined && form === undefined, "data-has-selection": selectedId !== undefined || form !== undefined, children: [_jsxs("div", { className: "dsh-personal-todo-list", children: [busy && todos.length === 0 && _jsx("div", { className: "dsh-personal-todo-empty", children: t('state.loading') }), !busy && error === undefined && todos.length === 0 && (_jsxs("div", { className: "dsh-personal-todo-empty-state", children: [_jsx("span", { className: "dsh-personal-todo-empty-icon", children: _jsx(EmptyIcon, { size: 28, strokeWidth: 1.5, "aria-hidden": "true" }) }), _jsx("h3", { children: emptyMessage }), _jsx("p", { children: t(`empty.${view}`) }), view === 'pending' && _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(Plus, { size: 16, "aria-hidden": "true" }), onClick: openCreateForm, children: t('empty.create') })] })), assigneeGroups.map((group, groupIndex) => (_jsxs("section", { className: "dsh-personal-todo-assignee-group", "aria-labelledby": `todo-assignee-group-${String(groupIndex)}`, children: [_jsxs("h3", { className: "dsh-personal-todo-assignee-heading", id: `todo-assignee-group-${String(groupIndex)}`, children: [_jsx(UserRound, { size: 14, "aria-hidden": "true" }), _jsx("span", { children: group.assignee ?? t('assignee.unassigned') }), _jsx("span", { className: "dsh-personal-todo-assignee-count", children: group.todos.length })] }), group.todos.map(todo => (_jsxs("article", { className: "dsh-personal-todo-item", "data-selected": todo.id === selectedId, children: [_jsxs("button", { type: "button", className: "dsh-personal-todo-select", onClick: () => { selectTodo(todo.id); }, children: [_jsxs("div", { className: "dsh-personal-todo-card-heading", children: [_jsx("h3", { children: todo.title }), _jsx(ChevronRight, { size: 16, "aria-hidden": "true" })] }), (todo.latestSummary ?? todo.notes) !== null && _jsx("p", { children: todo.latestSummary ?? todo.notes })] }), _jsxs("div", { className: "dsh-personal-todo-card-footer", children: [_jsxs("div", { className: "dsh-personal-todo-meta", children: [view === 'archived' && _jsxs("span", { className: "dsh-personal-todo-badge", "data-status": todo.status, children: [_jsx(CircleDot, { size: 12, "aria-hidden": "true" }), statusLabel(todo.status)] }), todo.priority !== 'none' && _jsxs("span", { className: "dsh-personal-todo-badge", "data-priority": todo.priority, children: [todo.priority === 'high' ? _jsx(ChevronsUp, { size: 14, "aria-hidden": "true" }) : todo.priority === 'medium' ? _jsx(Equal, { size: 14, "aria-hidden": "true" }) : _jsx(ArrowDown, { size: 14, "aria-hidden": "true" }), priorityLabel(todo.priority)] }), todo.tags.map(tag => _jsxs("span", { className: "dsh-personal-todo-badge", title: tag, children: [_jsx(Tag, { size: 12, "aria-hidden": "true" }), _jsx("span", { className: "dsh-personal-todo-tag-text", children: tag })] }, tag))] }), todo.status === 'pending' && _jsx(Button, { size: "sm", variant: "outline", icon: _jsx(Play, { size: 14, "aria-hidden": "true" }), disabled: busy, onClick: () => { void mutate(signal => start(todo.id, signal)); }, children: t('action.start') })] })] }, todo.id)))] }, group.key))), result?.hasMore === true && _jsx(Button, { className: "dsh-personal-todo-more", size: "sm", variant: "outline", disabled: busy, onClick: () => { void fetchPage(todos.length, true); }, children: t('action.loadMore') })] }), _jsxs("div", { className: "dsh-personal-todo-detail-pane", children: [_jsxs("section", { className: "dsh-personal-todo-detail", children: [form !== undefined && _jsx(_Fragment, { children: _jsxs("div", { className: "dsh-personal-todo-form", children: [_jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.title'), _jsx("input", { autoFocus: true, required: true, value: form.title, maxLength: 200, placeholder: t('field.titlePlaceholder'), onChange: event => { setForm({ ...form, title: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.notes'), _jsx("textarea", { value: form.notes, maxLength: 10_000, placeholder: t('field.notesPlaceholder'), onChange: event => { setForm({ ...form, notes: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", children: [t('field.assignee'), _jsx("input", { value: form.assignee, maxLength: 100, placeholder: t('field.assigneePlaceholder'), onChange: event => { setForm({ ...form, assignee: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", children: [t('field.priority'), _jsxs("select", { value: form.priority, onChange: event => { setForm({ ...form, priority: event.target.value }); }, children: [_jsx("option", { value: "none", children: t('priority.none') }), _jsx("option", { value: "low", children: t('priority.low') }), _jsx("option", { value: "medium", children: t('priority.medium') }), _jsx("option", { value: "high", children: t('priority.high') })] })] }), _jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.dueAt'), _jsx("input", { type: "datetime-local", value: form.dueLocal, onChange: event => { setForm({ ...form, dueLocal: event.target.value }); } })] }), _jsxs("label", { className: "dsh-personal-todo-field", "data-wide": "true", children: [t('field.tags'), _jsx("input", { value: form.tags, placeholder: t('field.tagsPlaceholder'), onChange: event => { setForm({ ...form, tags: event.target.value }); } })] })] }) }), form === undefined && selectedId === undefined && _jsx("div", { className: "dsh-personal-todo-empty", children: t('detail.empty') }), form === undefined && selectedId !== undefined && detail === undefined && _jsx("div", { className: "dsh-personal-todo-empty", children: t('state.loadingDetail') }), form === undefined && detail !== undefined && detail.todo.id === selectedId && _jsxs(_Fragment, { children: [_jsxs("div", { className: "dsh-personal-todo-detail-header", children: [_jsxs("div", { className: "dsh-personal-todo-detail-summary", children: [_jsxs("div", { className: "dsh-personal-todo-title-row", children: [_jsx("h2", { children: detail.todo.title }), _jsxs("span", { className: "dsh-personal-todo-badge", "data-status": detail.todo.status, children: [_jsx(DetailStatusIcon, { size: 14, "aria-hidden": "true" }), statusLabel(detail.todo.status)] })] }), _jsxs("div", { className: "dsh-personal-todo-meta", children: [_jsxs("span", { className: "dsh-personal-todo-owner", children: [_jsx(UserRound, { size: 14, "aria-hidden": "true" }), t('meta.assignee', { assignee: detail.todo.assignee ?? t('assignee.unassigned') })] }), detail.todo.reviewRound > 0 && _jsx("span", { children: t('meta.reviewRound', { round: detail.todo.reviewRound }) })] })] }), _jsxs("div", { className: "dsh-personal-todo-deadline", children: [_jsx(CalendarDays, { size: 14, "aria-hidden": "true" }), _jsx("span", { children: t('field.dueAt') }), detail.todo.dueAt === null ? _jsx("span", { children: t('meta.noDueDate') }) : _jsx("time", { dateTime: detail.todo.dueAt, children: new Date(detail.todo.dueAt).toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) })] }), _jsxs("div", { className: "dsh-personal-todo-detail-actions", children: [detail.todo.status === 'pending' && _jsx(Button, { className: "dsh-personal-todo-new", size: "sm", variant: "primary", icon: _jsx(Play, { size: 14, "aria-hidden": "true" }), disabled: busy, onClick: () => { void mutate(signal => start(detail.todo.id, signal)); }, children: t('action.start') }), detail.todo.primarySessionId !== null && _jsx(Button, { size: "sm", variant: "primary", onClick: () => { openConversation(detail.todo.primarySessionId, null); }, children: t('action.openConversation') }), _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Pencil, { size: 16, "aria-hidden": "true" }), disabled: busy, onClick: () => { setForm(formOf(detail.todo)); }, children: t('action.edit') }), detail.todo.archivedAt === null && _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Archive, { size: 14, "aria-hidden": "true" }), disabled: busy, onClick: () => {
                                                                                    void mutate(signal => archive(detail.todo.id, signal), false).then((saved) => {
                                                                                        if (saved) {
                                                                                            setSelectedId(undefined);
                                                                                            setDetail(undefined);
                                                                                        }
                                                                                    });
                                                                                }, children: t('action.archive') }), detail.todo.archivedAt !== null && _jsx(Button, { size: "sm", variant: "ghost", icon: _jsx(Undo2, { size: 14, "aria-hidden": "true" }), disabled: busy, onClick: () => {
                                                                                    void mutate(signal => restore(detail.todo.id, signal), false).then((saved) => {
                                                                                        if (saved) {
                                                                                            setSelectedId(undefined);
                                                                                            setDetail(undefined);
                                                                                        }
                                                                                    });
                                                                                }, children: t('action.restore') }), (detail.todo.archivedAt !== null || detail.todo.status === 'pending' || detail.todo.status === 'completed' || detail.todo.status === 'cancelled') && _jsx(Button, { className: "dsh-personal-todo-delete", size: "sm", variant: "ghost", icon: _jsx(Trash2, { size: 16, "aria-hidden": "true" }), onClick: () => { setConfirming(detail.todo); }, children: t('action.delete') })] })] }), detail.todo.status === 'in_review' && selectedRun !== undefined && _jsxs("section", { className: "dsh-personal-todo-review", children: [_jsxs("h3", { children: [_jsx(ClipboardCheck, { size: 18, "aria-hidden": "true" }), t('detail.review')] }), _jsxs("dl", { children: [_jsxs("div", { children: [_jsxs("dt", { children: [_jsx(ClipboardList, { size: 14, "aria-hidden": "true" }), t('review.summary')] }), _jsx("dd", { children: selectedRun.resultSummary ?? '—' })] }), _jsxs("div", { children: [_jsxs("dt", { children: [_jsx(CircleCheck, { size: 14, "aria-hidden": "true" }), t('review.verification')] }), _jsx("dd", { children: selectedRun.verification ?? '—' })] }), _jsxs("div", { children: [_jsxs("dt", { children: [_jsx(Flag, { size: 14, "aria-hidden": "true" }), t('review.risk')] }), _jsx("dd", { children: selectedRun.risk ?? '—' })] })] })] }), detail.todo.notes !== null && _jsxs("section", { className: "dsh-personal-todo-detail-section", children: [_jsx("h3", { children: t('field.notes') }), _jsx("p", { children: detail.todo.notes })] }), detail.todo.archivedAt !== null && _jsx("div", { className: "dsh-personal-todo-meta", children: _jsx("span", { children: t('meta.archived', { date: new Date(detail.todo.archivedAt).toLocaleString() }) }) }), detail.todo.blockedReason !== null && _jsxs("div", { className: "dsh-personal-todo-callout", children: [_jsx("strong", { children: t('detail.waitingForYou') }), _jsx("p", { children: detail.todo.blockedReason })] }), _jsxs("section", { className: "dsh-personal-todo-detail-section", children: [_jsx("h3", { children: t('detail.conversations') }), detail.sessions.length === 0 ? _jsxs("div", { className: "dsh-personal-todo-session-empty", children: [_jsx(MessageSquare, { size: 18, "aria-hidden": "true" }), _jsx("p", { children: t('detail.noConversations') })] }) : detail.sessions.map((session, index) => _jsxs("button", { type: "button", className: "dsh-personal-todo-session", "aria-label": t('action.openConversation'), "aria-describedby": `personal-todo-session-${index}`, disabled: busy, onClick: () => { openConversation(session.sessionId, session.parentSessionId); }, children: [_jsx("span", { className: "dsh-personal-todo-session-icon", children: session.role === 'primary' ? _jsx(MessageSquare, { size: 18, "aria-hidden": "true" }) : _jsx(GitBranch, { size: 18, "aria-hidden": "true" }) }), _jsx("span", { className: "dsh-personal-todo-session-name", id: `personal-todo-session-${index}`, children: sessionLabel(session, detail.sessions) }), _jsxs("span", { className: "dsh-personal-todo-session-open", "aria-hidden": "true", children: [t('action.openConversation'), _jsx(ChevronRight, { size: 16 })] })] }, session.sessionId))] }), _jsxs("section", { className: "dsh-personal-todo-detail-section", children: [_jsx("h3", { children: t('detail.activity') }), _jsx("div", { className: "dsh-personal-todo-timeline", children: detail.events.map(event => _jsxs("div", { className: "dsh-personal-todo-event", children: [_jsx(CircleDot, { size: 14, "aria-hidden": "true" }), _jsxs("div", { className: "dsh-personal-todo-event-content", children: [_jsx("strong", { children: eventLabel(event.type) }), event.message !== null && _jsx("p", { children: event.message }), _jsx("time", { dateTime: event.createdAt, children: new Date(event.createdAt).toLocaleString() })] })] }, event.id)) })] })] })] }), form !== undefined && _jsxs("div", { className: "dsh-personal-todo-form-actions", children: [_jsx(Button, { variant: "outline", onClick: () => { setForm(undefined); }, children: t('action.cancel') }), form.id === undefined && _jsx(Button, { variant: "outline", disabled: busy || form.title.trim() === '', onClick: () => { saveForm(false); }, children: t('action.createOnly') }), _jsx(Button, { className: "dsh-personal-todo-new", variant: "primary", disabled: busy || form.title.trim() === '', onClick: () => { saveForm(form.id === undefined); }, children: form.id === undefined ? t('action.create') : t('action.save') })] }), form === undefined && detail !== undefined && detail.todo.id === selectedId && detail.todo.status === 'blocked' && _jsxs("div", { className: "dsh-personal-todo-commandbar", children: [_jsx("textarea", { "aria-label": t('reply.aria'), value: replyText, onChange: event => { setReplyText(event.target.value); }, placeholder: t('reply.placeholder') }), _jsx("div", { className: "dsh-personal-todo-commandbar-actions", children: _jsx(Button, { variant: "primary", disabled: busy || replyText.trim() === '', onClick: () => { void mutate(signal => reply({ id: detail.todo.id, message: replyText }, signal)).then(saved => { if (saved)
                                                                setReplyText(''); }); }, children: t('action.reply') }) })] }), form === undefined && detail !== undefined && detail.todo.id === selectedId && detail.todo.status === 'in_review' && _jsxs("section", { className: "dsh-personal-todo-commandbar dsh-personal-todo-review-actions", "aria-label": t('review.actions'), children: [_jsxs("div", { className: "dsh-personal-todo-review-action-heading", children: [_jsx("strong", { children: t('review.actions') }), _jsx("span", { children: t('review.actionHint') })] }), _jsx("textarea", { "aria-label": t('feedback.aria'), value: feedback, onChange: event => { setFeedback(event.target.value); }, placeholder: t('feedback.placeholder') }), _jsxs("div", { className: "dsh-personal-todo-commandbar-actions", children: [_jsx(Button, { variant: "outline", icon: _jsx(MessageSquare, { size: 16, "aria-hidden": "true" }), disabled: busy || feedback.trim() === '', onClick: () => { void mutate(signal => requestChanges({ id: detail.todo.id, feedback }, signal)).then(saved => { if (saved)
                                                                    setFeedback(''); }); }, children: t('action.requestChanges') }), _jsx(Button, { className: "dsh-personal-todo-new", variant: "primary", icon: _jsx(CircleCheck, { size: 16, "aria-hidden": "true" }), disabled: busy, onClick: () => { void mutate(signal => approve(detail.todo.id, signal)); }, children: t('action.approve') })] })] })] })] })] })] }), _jsx(Modal, { open: confirming !== undefined, onClose: () => { setConfirming(undefined); }, title: t('delete.title'), closeLabel: t('delete.close'), description: confirming === undefined ? '' : t('delete.description', { title: confirming.title }), className: "dsh-personal-todo-small-dialog", footer: _jsxs(_Fragment, { children: [_jsx(Button, { variant: "outline", onClick: () => { setConfirming(undefined); }, children: t('action.cancel') }), _jsx(Button, { variant: "primary", disabled: busy, onClick: () => {
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
