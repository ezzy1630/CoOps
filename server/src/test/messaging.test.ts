import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { readProofPackage } from '../../../src/evidence/proofPackage.js'
import { readRunEvidence } from '../../../src/evidence/runEvidence.js'

/**
 * The message hierarchy in docs/messaging.md, checked instead of trusted. An
 * asset that opens with the architecture has buried the only thing a reader who
 * stops after one line would have understood.
 */

/** Named in the plan: each is introduced where its role becomes visible, not before. */
const DEFERRED_VOCABULARY = ['gemini', 'a2a', 'firestore', 'model armor', 'sse', 'oauth', 'protocol']

/** The outcome is the video leaving the laptop for the channel; both halves have to be there. */
const OUTCOME = [/laptop/i, /youtube/i]

interface Surface {
  path: string
  /** false for reference material, which still may not open with vendor names */
  leadsWithOutcome: boolean
}

const SURFACES: Surface[] = [
  { path: 'README.md', leadsWithOutcome: true },
  { path: 'docs/architecture.md', leadsWithOutcome: true },
  { path: 'docs/launch-copy.md', leadsWithOutcome: true },
  // The spec that states the rule, and the deployment reference, are not the
  // assets the rule is about; both still defer the vendor vocabulary.
  { path: 'docs/messaging.md', leadsWithOutcome: false },
  { path: 'docs/deploy.md', leadsWithOutcome: false },
]

/** Walk up to the checkout root so the test does not depend on the caller's cwd. */
async function repoRoot(): Promise<string> {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let up = 0; up < 8; up++) {
    try {
      await access(join(dir, 'index.html'))
      return dir
    } catch {
      dir = resolve(dir, '..')
    }
  }
  throw new Error('could not locate the repository root from the test file')
}

/** A document's opening: the prose before its first subheading or code block. */
function opening(markdown: string): string {
  const body = markdown.replace(/^#[^\n]*\n/, '')
  const stops = [body.indexOf('\n## '), body.indexOf('\n```')].filter(index => index >= 0)
  return stops.length > 0 ? body.slice(0, Math.min(...stops)) : body
}

/** The lead: the first paragraph of the opening, which is the line a scanner reads. */
function lead(markdown: string): string {
  return opening(markdown).trim().split(/\n\s*\n/)[0] ?? ''
}

function deferredTermsIn(text: string): string[] {
  const lower = text.toLowerCase()
  return DEFERRED_VOCABULARY.filter(term => new RegExp(`\\b${term}\\b`).test(lower))
}

test('every public surface opens with the outcome, not the architecture', async () => {
  const root = await repoRoot()
  for (const surface of SURFACES.filter(s => s.leadsWithOutcome)) {
    // The first paragraph, not merely somewhere above the fold: an outcome in
    // the third paragraph has already lost the reader who stopped at the first.
    const first = lead(await readFile(join(root, surface.path), 'utf8'))
    for (const half of OUTCOME) {
      assert.match(first, half, `${surface.path} does not name the outcome in its first paragraph`)
    }
  }
})

test('no public surface opens with technology the reader has no reason for yet', async () => {
  const root = await repoRoot()
  for (const surface of SURFACES) {
    const lead = opening(await readFile(join(root, surface.path), 'utf8'))
    assert.deepEqual(deferredTermsIn(lead), [], `${surface.path} opens with deferred vocabulary`)
  }
})

test('the page a judge lands on carries the outcome and the locked tagline', async () => {
  const root = await repoRoot()
  const html = await readFile(join(root, 'index.html'), 'utf8')
  const description = /name="description"[\s\S]*?content="([^"]+)"/.exec(html)?.[1] ?? ''
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? ''

  for (const half of OUTCOME) assert.match(description, half)
  assert.deepEqual(deferredTermsIn(description), [])
  assert.match(title, /every department gets its own agent team/i)
})

test('the outcome is only claimed in the past tense where a run can back it', async () => {
  const root = await repoRoot()
  const readme = opening(await readFile(join(root, 'README.md'), 'utf8'))

  // "made it from a laptop to the channel" is a receipt. Until the go/no-go
  // gates read GO, the README describes what CoOps does, not what it did.
  assert.doesNotMatch(readme, /made it (from|to)/i)
  assert.match(readme, /CoOps moves a launch video/)
})

/** The third column of the claim table in docs/launch-copy.md. */
function claimBackings(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter(line => line.startsWith('| ') && !line.startsWith('| Claim'))
    .map(line => (line.split('|')[3] ?? '').trim().replace(/`/g, ''))
    .filter(Boolean)
}

test('every claim in the launch copy rests on a receipt the run actually produces', async () => {
  const root = await repoRoot()
  const evidence = readRunEvidence({
    events: [],
    tasks: [],
    executionMode: 'live',
    liveConnection: 'connected',
    runtimeInfo: null,
  })
  const sections = readProofPackage({ events: [], evidence, runtimeInfo: null }).sections.map(section => section.id)
  // 'architecture' is the honest escape hatch: no receipt records an absence, so
  // the claim that no credential was shared has to name the code instead.
  const backings = new Set<string>([...sections, 'architecture'])

  const claimed = claimBackings(await readFile(join(root, 'docs/launch-copy.md'), 'utf8'))

  assert.ok(claimed.length >= 5, 'the launch copy has stopped listing what its claims rest on')
  for (const backing of claimed) {
    assert.ok(backings.has(backing), `the launch copy claims proof from "${backing}", which the proof package does not produce`)
  }
})
