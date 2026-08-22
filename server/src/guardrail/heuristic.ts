import type { GuardrailAdapter } from './types.js'

interface Rule {
  category: string
  pattern: RegExp
  requires?: RegExp
}

// First matching rule wins. pii_card simplified per spec: /card/i anywhere in
// the text instead of a ±40-char window.
export const RULES: readonly Rule[] = [
  { category: 'prompt_injection', pattern: /ignore (all )?(previous|prior|above) instructions/i },
  { category: 'prompt_injection', pattern: /disregard (all |your )?(rules|instructions)/i },
  { category: 'prompt_injection', pattern: /reveal (your )?(system )?prompt/i },
  { category: 'prompt_injection', pattern: /\bdeveloper mode\b/i },
  { category: 'secret_exfiltration', pattern: /\bsk-[a-z0-9]{16,}\b/i },
  { category: 'secret_exfiltration', pattern: /api[_-]?key\s*[:=]/i },
  { category: 'secret_exfiltration', pattern: /\b(password|passwd|secret)\s*[:=]\s*\S+/i },
  { category: 'secret_exfiltration', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { category: 'pii_ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { category: 'pii_card', pattern: /\b(?:\d[ -]*?){13,16}\b/, requires: /card/i },
]

export function createHeuristicGuardrail(): GuardrailAdapter {
  return {
    inspect(text) {
      const t = text.trim()
      if (!t) return { blocked: false }
      for (const r of RULES) {
        if (r.pattern.test(t) && (!r.requires || r.requires.test(t))) return { blocked: true, category: r.category }
      }
      return { blocked: false }
    },
  }
}
