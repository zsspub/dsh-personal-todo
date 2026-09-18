import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../lib/', import.meta.url))
const clientBundle = join(root, 'client.js')
const packageManifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
)

function normalize(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      normalize(path)
      continue
    }
    if (!/\.(?:js|d\.ts|map)$/u.test(entry.name)) continue
    const source = readFileSync(path, 'utf8')
    const normalized = `${source.replace(/[\t ]+$/gmu, '').replace(/\n*$/u, '')}\n`
    if (normalized !== source) writeFileSync(path, normalized)
  }
}

normalize(root)

const clientSource = readFileSync(clientBundle, 'utf8')
if (/\bprocess\.env\.NODE_ENV\b/u.test(clientSource)) {
  throw new Error('客户端产物不能包含 process.env.NODE_ENV。')
}

const injectedModules = new Set(packageManifest.dsh.client.inject)
const externalModules = new Set(
  [...clientSource.matchAll(/\brequire\((["'`])([^"'`]+)\1\)/gu)]
    .map(match => match[2])
    .filter(specifier => specifier.startsWith('@deepseek-ai/')),
)
const missingModules = [...externalModules].filter(
  specifier => !injectedModules.has(specifier),
)
if (missingModules.length > 0) {
  throw new Error(
    `客户端外部模块必须声明在 dsh.client.inject：${missingModules.join(', ')}`,
  )
}
