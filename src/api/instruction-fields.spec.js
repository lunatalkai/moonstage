import { describe, expect, it } from 'vitest'
import { instructionsToAPI, instructionsFromAPI } from './instruction-fields'

describe('Open API instruction field', () => {
  it('preserves omitted, empty and user metadata fields', () => {
    const body = { fields: { jailbreak: '', cardMeta: { jailbreak: 'untouched' }, roleDesc: 'jailbreak' } }
    expect(instructionsToAPI(body)).toEqual({ fields: { customInstructions: '', cardMeta: { jailbreak: 'untouched' }, roleDesc: 'jailbreak' } })
    expect(body.fields).toHaveProperty('jailbreak', '')
    expect(instructionsToAPI({ roleId: 'r' })).toEqual({ roleId: 'r' })
    expect(instructionsToAPI({ card: { jailbreak: 'custom' } })).toEqual({ card: { customInstructions: 'custom' } })
  })
  it('reads the canonical name into existing UI state without changing the wire', () => {
    const wire = { data: { defaultCustomInstructions: 'default', customInstructions: '', tokenBudget: { limits: { customInstructionsMaxChars: 500 } } } }
    expect(instructionsFromAPI(wire)).toEqual({ data: { defaultJailbreak: 'default', jailbreak: '', tokenBudget: { limits: { jailbreakMaxChars: 500 } } } })
    expect(wire.data).toHaveProperty('customInstructions')
  })
})

import { setupHttp } from './http-setup'
it('uses the canonical name through the actual HTTP interceptors', async () => {
  let request, response
  const http = { create() {}, interceptors: { request: { use(fn) { request = fn } }, response: { use(fn) { response = fn } } } }
  setupHttp(http, { host: 'https://api.example.test', loading: { show() {}, hide() {} }, toast: {}, getLocale: () => 'en', getFreshAccessToken: async () => 'token' })
  const sent = await request({ url: '/open/v1/player/role-settings/save', data: { roleId: 'r', jailbreak: 'Keep it concise.' } })
  expect(sent.data).toEqual({ roleId: 'r', customInstructions: 'Keep it concise.' })
  const read = response({ statusCode: 200, data: { defaultCustomInstructions: 'default' } })
  expect(read.data.defaultJailbreak).toBe('default')
})
