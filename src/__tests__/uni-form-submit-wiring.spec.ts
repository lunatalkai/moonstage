import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// `form` and `button` are uni-app built-in components, not HTML elements. A
// uni-app `<form>` renders `<uni-form>` and only emits `submit` when a child
// button asks it to, and uni-app's `<button type="...">` is a style prop, not
// the HTML submit idiom. A button that carries only `type="submit"` therefore
// does nothing at all: no navigation, no form event, no request. The failure is
// silent in the browser and invisible to API-level tests, so the wiring is
// pinned here instead.
const vueFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : vueFiles(target)
    return entry.isFile() && entry.name.endsWith('.vue') ? [target] : []
  })

const buttonTags = (source: string): string[] => source.match(/<button\b[^>]*>/g) || []

describe('uni-app form submit wiring', () => {
  it('never leaves a submit button wired only through the HTML type attribute', () => {
    const root = path.resolve(process.cwd(), 'src')
    const unwired: string[] = []
    for (const file of vueFiles(root)) {
      const source = fs.readFileSync(file, 'utf8')
      for (const tag of buttonTags(source)) {
        if (!/\btype="submit"/.test(tag)) continue
        if (/\bform-type="submit"/.test(tag) || /@click/.test(tag)) continue
        unwired.push(`${path.relative(root, file)}: ${tag.slice(0, 120)}`)
      }
    }
    expect(unwired).toEqual([])
  })
})
