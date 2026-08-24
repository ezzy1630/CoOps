import assert from 'node:assert/strict'
import test from 'node:test'
import { setCompanyTemplate } from '../../../src/data/company.js'
import { everpeak } from '../../../src/data/companies/everpeak.js'
import { readArtifactRecord } from '../../../src/artifacts/model.js'
import type { WorldEvent } from '../../../src/types.js'

setCompanyTemplate(everpeak)

const delivered = (payload: WorldEvent['payload']): WorldEvent => ({
  id: 'evt-artifact',
  ts: Date.UTC(2026, 7, 23),
  type: 'ArtifactDelivered',
  title: 'Delivered: Launch brief',
  payload,
})

test('live content stays live and preserves a valid external location', () => {
  const record = readArtifactRecord(delivered({
    artifact: {
      name: 'Launch brief',
      type: 'Memo',
      content: 'The worker wrote this content.',
      source: 'Gemini 3.7 Flash',
      location: {
        provider: 'google-drive',
        url: 'https://drive.google.com/file/d/abc/view',
      },
    },
  }))

  assert.equal(record.provenance, 'live-content')
  assert.equal(record.document?.live?.source, 'Gemini 3.7 Flash')
  assert.equal(record.location?.label, 'Open in Drive')
})

test('rehearsal metadata resolves to an explicitly labeled sample document', () => {
  const record = readArtifactRecord(delivered({
    simulated: true,
    artifact: { name: 'Launch brief', type: 'Memo' },
  }))

  assert.equal(record.provenance, 'rehearsal-template')
  assert.ok(record.document)
  assert.match(record.provenanceDetail, /labeled local rehearsal/)
})

test('live metadata never turns into invented document content', () => {
  const record = readArtifactRecord(delivered({
    artifact: { name: 'Launch brief', type: 'Memo' },
  }))

  assert.equal(record.provenance, 'metadata-only')
  assert.equal(record.document, null)
})

test('unsafe external locations do not become actions', () => {
  const record = readArtifactRecord(delivered({
    artifact: {
      name: 'Launch brief',
      type: 'Memo',
      content: 'Readable content.',
      location: { provider: 'external', url: 'javascript:alert(1)' },
    },
  }))

  assert.equal(record.location, null)
})
