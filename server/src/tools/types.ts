import type { Receipt } from '../../../src/types.js'

export interface ToolResult {
  ok: boolean
  detail: string
  /** inspectable proof for the externally observable step this call performed */
  receipt?: Receipt
}

/** The asset the launch pipeline currently holds, carried between steps. */
export interface StagedAsset {
  /** absolute path, resolved inside an allow-listed root */
  path: string
  connector: string
  searchRoot: string
  filename: string
  bytes: number
  modifiedAt: string
  sha256: string
  md5Base64: string
  /** set once the asset reaches Cloud Storage */
  bucket?: string
  object?: string
}

export interface WorkspaceToolAdapter {
  call(tool: string, action: string): Promise<ToolResult>
  /** the asset staged by the launch pipeline, if any */
  staged?(): StagedAsset | null
}
