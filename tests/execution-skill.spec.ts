import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as ExecutionSkill from '../src/execution-skill.ts'

describe('personal-todo-execution skill provider', () => {
  it('registers, loads, and disposes the bundled execution skill', async () => {
    const ctx = new Context()
    await ctx.plugin(SkillRegistry)
    const fiber = await ctx.plugin(ExecutionSkill)

    const summaries = await ctx.skills.list()
    expect(summaries).toEqual([{
      name: 'personal-todo-execution',
      description: expect.stringContaining('标准流程'),
      invocation: { modelInvocable: true, userInvocable: false },
      provider: 'personal-todo',
      source: 'bundled',
      resourceBase: { kind: 'directory', path: expect.stringContaining('assets') },
    }])

    const loaded = await ctx.skills.get('personal-todo-execution')
    expect(loaded?.content).toContain('# 执行个人待办')
    expect(loaded?.content).toContain('自主决定由谁执行、如何执行')
    expect(loaded?.content).toContain('personal_todo_submit_review')
    expect(loaded?.content).toContain('只有用户可以审核通过。')

    await fiber.dispose()
    expect(await ctx.skills.list()).toEqual([])
  })
})
