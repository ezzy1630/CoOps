import type { WorkspaceToolAdapter } from './types.js'

export const WORKSPACE_TOOLS = ['gdrive', 'gsheets', 'zendesk', 'shopify', 'slack'] as const

export function createDryRunTools(): WorkspaceToolAdapter {
  return {
    async call(tool, action) {
      const name = tool.trim().toLowerCase()
      const act = action.trim()
      if (!(WORKSPACE_TOOLS as readonly string[]).includes(name)) {
        return { ok: false, detail: `unknown tool ${name || '(empty)'}` }
      }
      if (!act) {
        return { ok: false, detail: 'empty action' }
      }
      return {
        ok: true,
        detail: `dry-run: ${name}.${act} recorded — no external system touched`,
      }
    },
  }
}
