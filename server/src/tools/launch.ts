import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { google } from 'googleapis'
import type { Receipt, WorldEvent } from '../../../src/types.js'
import type { StagedAsset, ToolResult } from './types.js'

/** The three launch-pipeline tools, in the order the run has to prove them. */
export const LAUNCH_TOOLS = ['localfile', 'gcs', 'youtube'] as const

export interface LaunchToolDeps {
  /** absolute roots the connector may read; nothing outside them is reachable */
  localRoots: string[]
  /** the machine identity recorded on every discovery receipt */
  connectorId: string
  bucket?: string
  getAccessToken?: () => Promise<string | null>
  /** the newest human approval for a publication, read from the event log */
  approvedPublication?: () => Receipt | null
}

export interface LaunchTools {
  call(tool: string, action: string): Promise<ToolResult>
  staged(): StagedAsset | null
}

const MAX_ENTRIES = 20_000
const MAX_DEPTH = 6
const SKIPPED_DIRS = new Set(['node_modules', '.git', 'dist', 'Library', 'System'])

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf',
}

/**
 * The launch pipeline: find a file on this machine, stage it in Cloud Storage,
 * publish it to YouTube. Every step returns a receipt, and every step that
 * cannot reach its external system says so instead of implying it did.
 */
export function createLaunchTools(deps: LaunchToolDeps): LaunchTools {
  const roots = deps.localRoots.map((root) => resolve(root)).filter((root) => root.length > 0)
  let asset: StagedAsset | null = null

  async function discover(query: string): Promise<ToolResult> {
    if (roots.length === 0) {
      return {
        ok: false,
        detail: 'localfile failed: no allow-listed search root configured (COOPS_LOCAL_ROOTS)',
      }
    }
    const match = await findNewestMatch(roots, query)
    if (!match) {
      return { ok: false, detail: `localfile: no file matching "${query}" under ${roots.length} allow-listed root(s)` }
    }

    const digests = await digestFile(match.path)
    asset = {
      path: match.path,
      connector: deps.connectorId,
      searchRoot: match.root,
      filename: basename(match.path),
      bytes: match.bytes,
      modifiedAt: new Date(match.modifiedMs).toISOString(),
      sha256: digests.sha256,
      md5Base64: digests.md5Base64,
    }

    return {
      ok: true,
      detail: `localfile: ${asset.filename} (${asset.bytes} bytes, sha256 ${short(asset.sha256)}) under ${match.root}`,
      receipt: receipt('local-discovery', 'The asset was read from this machine, inside an allow-listed folder.', true, {
        connector: asset.connector,
        searchRoot: asset.searchRoot,
        filename: asset.filename,
        modifiedAt: asset.modifiedAt,
        bytes: `${asset.bytes} bytes`,
        checksum: `sha256:${asset.sha256}`,
      }),
    }
  }

  async function handoff(objectName: string): Promise<ToolResult> {
    if (!asset) return { ok: false, detail: 'gcs failed: no asset staged — run localfile first' }
    const bucket = deps.bucket?.trim()
    const object = (objectName || `coops/${asset.filename}`).replace(/^\/+/, '')
    const token = deps.getAccessToken ? await deps.getAccessToken() : null

    if (!bucket || !token) {
      const missing = !bucket ? 'COOPS_GCS_BUCKET not configured' : 'no Google credentials connected'
      return {
        ok: true,
        detail: `dry-run: gcs.upload of ${asset.filename} recorded; ${missing}, nothing was uploaded`,
        receipt: receipt('cloud-handoff', 'A Cloud Storage upload was recorded but not performed.', false, {
          bucket: bucket ?? 'not configured',
          object,
          bytesUploaded: '0 (not uploaded)',
          checksum: `sha256:${asset.sha256}`,
          status: `dry-run — ${missing}`,
        }),
      }
    }

    try {
      const storage = google.storage({ version: 'v1', headers: { Authorization: `Bearer ${token}` } })
      const created = await storage.objects.insert({
        bucket,
        name: object,
        uploadType: 'media',
        media: { mimeType: mimeOf(asset.filename), body: createReadStream(asset.path) },
      })
      const uploadedBytes = Number.parseInt(created.data.size ?? '', 10)
      const md5Match = created.data.md5Hash === asset.md5Base64
      const sizeMatch = uploadedBytes === asset.bytes
      const ok = md5Match && sizeMatch
      asset = { ...asset, bucket, object }

      return {
        ok,
        detail: ok
          ? `gcs: uploaded ${object} to ${bucket} (generation ${created.data.generation}, md5 verified)`
          : `gcs failed: ${md5Match ? 'byte count' : 'md5'} of the stored object does not match the local file`,
        receipt: receipt(
          'cloud-handoff',
          ok
            ? 'The same bytes reached Cloud Storage and the stored md5 matches the local file.'
            : 'Cloud Storage returned an object that does not match the local file.',
          true,
          {
            bucket,
            object,
            generation: created.data.generation ?? 'not returned',
            bytesUploaded: `${Number.isNaN(uploadedBytes) ? asset.bytes : uploadedBytes} bytes`,
            checksum: `sha256:${asset.sha256}`,
            status: ok ? 'uploaded · md5 and byte count verified' : md5Match ? 'byte count mismatch' : 'md5 mismatch',
          },
          ok,
        ),
      }
    } catch (err) {
      return { ok: false, detail: `gcs failed: ${errorMessage(err)}` }
    }
  }

  async function publish(description: string): Promise<ToolResult> {
    if (!asset) return { ok: false, detail: 'youtube failed: no asset staged — run localfile first' }

    const approval = deps.approvedPublication?.() ?? null
    if (!approval) {
      return { ok: false, detail: 'youtube blocked: no human has approved a publication for this run' }
    }
    const approvedChecksum = approval.fields.checksum ?? ''
    if (approvedChecksum !== `sha256:${asset.sha256}`) {
      return {
        ok: false,
        detail: 'youtube blocked: the approved checksum does not match the staged asset — approval covers a different file',
      }
    }

    const title = approval.fields.title ?? asset.filename
    const privacyStatus = approval.fields.privacy ?? 'private'
    const token = deps.getAccessToken ? await deps.getAccessToken() : null
    if (!token) {
      return {
        ok: true,
        detail: `dry-run: youtube.upload of "${title}" recorded; no Google credentials connected, nothing was published`,
        receipt: receipt('publication', 'A YouTube upload was recorded but not performed.', false, {
          apiResult: 'dry-run — no Google credentials connected',
          privacyStatus,
        }),
      }
    }

    try {
      const youtube = google.youtube({ version: 'v3', headers: { Authorization: `Bearer ${token}` } })
      const inserted = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: { title, description: description || `Published by CoOps from ${asset.filename}.` },
          status: { privacyStatus },
        },
        media: { body: createReadStream(asset.path) },
      })
      const videoId = inserted.data.id
      if (!videoId) return { ok: false, detail: 'youtube failed: the API returned no video id' }

      return {
        ok: true,
        detail: `youtube: published "${title}" as ${videoId}`,
        receipt: receipt('publication', 'The video exists on YouTube and the API returned its id.', true, {
          apiResult: `videos.insert 200 · ${inserted.data.kind ?? 'youtube#video'}`,
          videoId,
          privacyStatus: inserted.data.status?.privacyStatus ?? privacyStatus,
          processingStatus: await processingStatus(youtube, videoId, inserted.data.status?.uploadStatus),
          url: `https://www.youtube.com/watch?v=${videoId}`,
        }),
      }
    } catch (err) {
      return { ok: false, detail: `youtube failed: ${errorMessage(err)}` }
    }
  }

  return {
    staged: () => asset,
    async call(tool, action) {
      const name = tool.trim().toLowerCase()
      const act = action.trim()
      if (name === 'localfile') {
        return act ? discover(act) : { ok: false, detail: 'localfile failed: empty search query' }
      }
      if (name === 'gcs') return handoff(act)
      if (name === 'youtube') return publish(act)
      return { ok: false, detail: `unknown launch tool ${name || '(empty)'}` }
    },
  }
}

/** The newest human approval of a publication, as recorded on the event log. */
export function readApprovedPublication(events: WorldEvent[]): Receipt | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event.type !== 'ApprovalGranted') continue
    const receipt = event.payload?.receipt
    if (receipt?.kind === 'authority' && receipt.ok) return receipt
  }
  return null
}

function receipt(
  kind: Receipt['kind'],
  claim: string,
  live: boolean,
  fields: Record<string, string>,
  ok = true,
): Receipt {
  return { kind, claim, live, ok, at: new Date().toISOString(), fields }
}

interface Match {
  path: string
  root: string
  bytes: number
  modifiedMs: number
}

/** Newest file whose name contains every whitespace-separated term of the query. */
async function findNewestMatch(roots: string[], query: string): Promise<Match | null> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  let best: Match | null = null
  let scanned = 0

  for (const root of roots) {
    const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]
    while (queue.length > 0 && scanned < MAX_ENTRIES) {
      const { dir, depth } = queue.shift()!
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (++scanned > MAX_ENTRIES) break
        if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (depth < MAX_DEPTH) queue.push({ dir: full, depth: depth + 1 })
          continue
        }
        if (!entry.isFile()) continue
        const name = entry.name.toLowerCase()
        if (!terms.every((term) => name.includes(term))) continue
        const inside = await resolveInsideRoot(full, root)
        if (!inside) continue
        const info = await stat(inside).catch(() => null)
        if (!info) continue
        if (!best || info.mtimeMs > best.modifiedMs) {
          best = { path: inside, root, bytes: info.size, modifiedMs: info.mtimeMs }
        }
      }
    }
  }
  return best
}

/** A symlink may point anywhere; the allow-list is checked against the real path. */
async function resolveInsideRoot(path: string, root: string): Promise<string | null> {
  try {
    const real = await realpath(path)
    const realRoot = await realpath(root)
    return real === realRoot || real.startsWith(realRoot.endsWith(sep) ? realRoot : realRoot + sep) ? real : null
  } catch {
    return null
  }
}

async function digestFile(path: string): Promise<{ sha256: string; md5Base64: string }> {
  const sha256 = createHash('sha256')
  const md5 = createHash('md5')
  for await (const chunk of createReadStream(path)) {
    sha256.update(chunk as Buffer)
    md5.update(chunk as Buffer)
  }
  return { sha256: sha256.digest('hex'), md5Base64: md5.digest('base64') }
}

async function processingStatus(
  youtube: ReturnType<typeof google.youtube>,
  videoId: string,
  fallback?: string | null,
): Promise<string> {
  try {
    const listed = await youtube.videos.list({ part: ['processingDetails'], id: [videoId] })
    const status = listed.data.items?.[0]?.processingDetails?.processingStatus
    if (status) return status
  } catch {
    // the video already exists; a failed status read must not erase that fact
  }
  return fallback ?? 'unknown'
}

function mimeOf(filename: string): string {
  return MIME_BY_EXT[extname(filename).toLowerCase()] ?? 'application/octet-stream'
}

function short(hex: string): string {
  return hex.slice(0, 12)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
