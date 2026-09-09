import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 使用真实 Markdown 渲染器验证格式与安全性，并由 Vite 处理其 CSS。
    server: { deps: { inline: ['@deepseek-ai/dsh-client-ui-primitives'] } },
    environmentMatchGlobs: [['tests/client-*.spec.tsx', 'jsdom']],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/client/index.ts'],
    },
  },
})
