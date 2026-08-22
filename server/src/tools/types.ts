export interface ToolResult {
  ok: boolean
  detail: string
}

export interface WorkspaceToolAdapter {
  call(tool: string, action: string): Promise<ToolResult>
}
