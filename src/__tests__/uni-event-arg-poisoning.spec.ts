import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// Vue passes the native event as the first argument to a bare handler binding:
// `@click="loadMore"` calls `loadMore(mouseEvent)`. When the handler's first
// parameter is a business value with a default (`epoch = searchEpoch`,
// `options = {}`), that default never applies and every `epoch === current`
// comparison is false against an event object.
//
// The damage is silent and shaped like a hang, not a crash: the request fires
// and succeeds, the result is discarded by a staleness guard that can never
// pass, and the `finally` block that clears the loading flag is gated by the
// same comparison — so the surface stays on its skeleton forever. The marketplace
// retry button was in exactly this state: pressing the one affordance offered
// for recovery is what bricked the page.
//
// The fix is always the same and always safe: bind an explicit call,
// `@click="loadMore()"`, so the parameter keeps its default.
//
// Handlers whose first parameter is the event itself (`e`, `event`, `$event`)
// are the legitimate shape and are not flagged.
const vueFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : vueFiles(target)
    return entry.isFile() && entry.name.endsWith('.vue') ? [target] : []
  })

// `src/en`, `src/ja`, `src/ko`, `src/zh-*` are generated per-locale mirrors of
// `src/pages`; scanning them would report every finding five extra times.
const isGeneratedLocaleMirror = (relative: string): boolean =>
  /^(en|ja|ko|zh-Hans|zh-Hant)[\\/]/.test(relative)

const EVENT_PARAM = /^(e|ev|evt|event|\$event)$/i

const bareHandlerNames = (source: string): Set<string> => {
  const names = new Set<string>()
  const binding = /@(?:click|tap|change|confirm|submit|longpress|blur|focus)(?:\.[a-z.]+)?\s*=\s*"([A-Za-z_$][\w$]*)"/g
  let match: RegExpExecArray | null
  while ((match = binding.exec(source))) names.add(match[1])
  return names
}

const firstParameterOf = (source: string, handler: string): string | null => {
  const declaration = new RegExp(
    `(?:async\\s+)?function\\s+${handler}\\s*\\(([^)]*)\\)` +
      `|(?:const|let|var)\\s+${handler}\\s*=\\s*(?:async\\s*)?\\(([^)]*)\\)\\s*=>` +
      `|(?:^|\\n)\\s*(?:async\\s+)?${handler}\\s*\\(([^)]*)\\)\\s*\\{`
  )
  const found = source.match(declaration)
  if (!found) return null
  const parameters = (found[1] ?? found[2] ?? found[3] ?? '').trim()
  return parameters ? parameters.split(',')[0].trim() : null
}

export const poisonedBareHandlers = (source: string): Array<{ handler: string; firstParam: string }> => {
  const poisoned: Array<{ handler: string; firstParam: string }> = []
  for (const handler of bareHandlerNames(source)) {
    const first = firstParameterOf(source, handler)
    if (!first || !first.includes('=')) continue
    const name = first.replace(/[:=].*$/, '').trim()
    if (EVENT_PARAM.test(name)) continue
    poisoned.push({ handler, firstParam: first })
  }
  return poisoned
}

describe('uni-app / Vue event argument poisoning', () => {
  it('never binds a handler bare when its first parameter carries a default', () => {
    const root = path.resolve(process.cwd(), 'src')
    const offenders: string[] = []
    for (const file of vueFiles(root)) {
      const relative = path.relative(root, file)
      if (isGeneratedLocaleMirror(relative)) continue
      for (const hit of poisonedBareHandlers(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${relative}: @click="${hit.handler}" but ${hit.handler}(${hit.firstParam}) — bind "${hit.handler}()" instead`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('flags a defaulted first parameter and leaves the event-first shape alone', () => {
    const poisoned = `
      <template><button @click="reload">go</button></template>
      <script setup lang="ts">
      async function reload(epoch = searchEpoch) { void epoch }
      </script>
    `
    const healthy = `
      <template>
        <button @click="reload()">go</button>
        <button @click="onPress">press</button>
      </template>
      <script setup lang="ts">
      async function reload(epoch = searchEpoch) { void epoch }
      function onPress(event: MouseEvent) { void event }
      </script>
    `
    expect(poisonedBareHandlers(poisoned).map(hit => hit.handler)).toEqual(['reload'])
    expect(poisonedBareHandlers(healthy)).toEqual([])
  })
})
