import { google } from 'googleapis'
import type { ToolResult, WorkspaceToolAdapter } from './types.js'
import { WORKSPACE_TOOLS } from './dryrun.js'

export interface WorkspaceToolsDeps {
  getAccessToken?: () => Promise<string | null>
  sheetsId?: string
}

const DRY_RUN_TOOLS = new Set(['zendesk', 'shopify', 'slack'])

export function createWorkspaceTools(deps: WorkspaceToolsDeps): WorkspaceToolAdapter {
  function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err)
  }

  async function driveAudit(action: string): Promise<ToolResult> {
    const token = deps.getAccessToken ? await deps.getAccessToken() : null
    if (!token) {
      return { ok: true, detail: `dry-run: gdrive.${action} recorded — no Google credentials connected` }
    }
    const name = `CoOps audit — ${action}`
    try {
      const drive = google.drive({ version: 'v3', headers: { Authorization: `Bearer ${token}` } })
      const created = await drive.files.create({
        requestBody: { name },
        media: {
          mimeType: 'application/json',
          body: JSON.stringify({ action, ts: new Date().toISOString() }),
        },
      })
      const fileId = created.data.id
      if (!fileId) return { ok: false, detail: 'gdrive failed: Drive returned no file id' }
      return { ok: true, detail: `gdrive: created Drive file "${name}" (${fileId})` }
    } catch (err) {
      return { ok: false, detail: `gdrive failed: ${errorMessage(err)}` }
    }
  }

  async function sheetsAudit(action: string): Promise<ToolResult> {
    const spreadsheetId = deps.sheetsId?.trim()
    if (!spreadsheetId) {
      return { ok: false, detail: 'gsheets failed: COOPS_SHEETS_ID not configured' }
    }
    const token = deps.getAccessToken ? await deps.getAccessToken() : null
    if (!token) {
      return { ok: true, detail: `dry-run: gsheets.${action} recorded — no Google credentials connected` }
    }
    try {
      const sheets = google.sheets({ version: 'v4', headers: { Authorization: `Bearer ${token}` } })
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Sheet1!A:C',
        valueInputOption: 'RAW',
        requestBody: { values: [[new Date().toISOString(), action]] },
      })
      return { ok: true, detail: `gsheets: appended row to ${spreadsheetId}` }
    } catch (err) {
      return { ok: false, detail: `gsheets failed: ${errorMessage(err)}` }
    }
  }

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
      if (DRY_RUN_TOOLS.has(name)) {
        return { ok: true, detail: `dry-run: ${name}.${act} recorded — no connector configured for this deployment` }
      }
      return name === 'gdrive' ? driveAudit(act) : sheetsAudit(act)
    },
  }
}
