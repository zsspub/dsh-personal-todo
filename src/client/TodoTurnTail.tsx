/** 在回合结束位置渲染待办展示卡片。 */

import React from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { TodoToolCard } from './TodoToolCard.tsx'
import type { PersonalTodoDataCenter } from './data-center.ts'
import { NS } from './locales.ts'
import type { PersonalTodoTurnResult } from './turn-todos.ts'

export interface TodoTurnTailInjected {
  readonly dataCenter: PersonalTodoDataCenter
  readonly openSession: (id: string, parentSessionId: string | null) => Promise<boolean>
}

export type TodoTurnTailProps =
  PropsRuntime<'conversation.chat.turnTail'>
  & PropsLocale<typeof NS>
  & TodoTurnTailInjected
  & { readonly matched: PersonalTodoTurnResult }

function blockOf(result: PersonalTodoTurnResult): ToolResultNode {
  return {
    kind: 'tool-result',
    seq: result.seq,
    time: 0,
    callId: result.callId,
    call: {
      name: 'personal_todo_show',
      argsRaw: JSON.stringify(result.meta.query),
    },
    callTime: null,
    content: [],
    isError: false,
    meta: result.meta,
    subCalls: [],
  }
}

/** 将回合投影恢复为现有待办卡片所需的稳定展示模型。 */
export function TodoTurnTail({
  matched, dataCenter, openSession, t,
}: TodoTurnTailProps) {
  return (
    <TodoToolCard
      block={blockOf(matched)}
      dataCenter={dataCenter}
      openSession={openSession}
      t={t}
    />
  )
}
