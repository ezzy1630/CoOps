# Demo approval continuation

## Source

- Kind: Parent packet finding
- Record: `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\complete-coops-demo`

## Outcome

Make an approved live publication request resume the requesting agent automatically, so the named human decision is the only action needed to continue toward YouTube publication.

## Completion

- Approving a live `PermissionRequest` whose reason identifies the publication proposal starts one continuation for the original requesting agent after the `ApprovalGranted` event is durable.
- The continuation reads the recorded authority receipt and attempts the next live publication step without requiring a second user chat.
- Denials, account connections, blueprint approvals, unrelated approvals, and duplicate resolutions do not start the publication continuation.
- The continuation cannot claim publication success unless the existing YouTube tool returns a real live receipt and video ID.
- The implementation preserves an inspectable event log and does not invent a human-authored chat message.
- The server builds and relevant existing checks pass. No test files, GitHub records, Notion records, or external systems are changed.

## Scope

Writable:

- `C:\Users\heroi\Code\Workspace\Src\CoOps\server\src\index.ts`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\server\src\brain\types.ts`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\server\src\brain\gemini.ts`
- `C:\Users\heroi\Code\Workspace\Src\CoOps\.factory\active\demo-approval-resume\state.md`

Read-only dependencies:

- `server/src/http.ts`
- `server/src/tools/launch.ts`
- Existing server tests and shared event types

## Inputs

- Runtime/evidence audit source trace
- Existing authority receipt and approval endpoint behavior
- Existing Gemini brain and YouTube tool path

## Outputs

- Minimal live continuation code and command-backed verification in `state.md`
