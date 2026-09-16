// Wire names differ from persisted drafts. Only declared API objects are mapped;
// prompt strings, cardMeta and arbitrary user content are never traversed.
export function instructionsToAPI(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const out = { ...body }
  if (Object.hasOwn(out, 'jailbreak')) {
    out.customInstructions = out.jailbreak
    delete out.jailbreak
  }
  for (const key of ['fields', 'fieldPatches', 'card']) {
    if (out[key]) out[key] = instructionsToAPI(out[key])
  }
  return out
}

export function instructionsFromAPI(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body
  const out = { ...body }
  for (const [wire, local] of Object.entries({ customInstructions: 'jailbreak', defaultCustomInstructions: 'defaultJailbreak', customInstructionsChars: 'jailbreakChars', customInstructionsMaxChars: 'jailbreakMaxChars' })) {
    if (Object.hasOwn(out, wire)) { out[local] = out[wire]; delete out[wire] }
  }
  for (const key of ['data', 'document', 'card', 'role', 'settings', 'tokenBudget', 'limits', 'detail']) {
    if (out[key]) out[key] = instructionsFromAPI(out[key])
  }
  for (const key of ['field', 'reason']) if (out[key] === 'customInstructions') out[key] = 'jailbreak'
  if (out.error === 'custom_instructions_too_long') out.error = 'jailbreak_too_long'
  return out
}
