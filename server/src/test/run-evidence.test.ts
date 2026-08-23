import assert from 'node:assert/strict'
import test from 'node:test'
import { readRunEvidence } from '../../../src/evidence/runEvidence.js'
import type { Task, WorldEvent } from '../../../src/types.js'

const task = (status: Task['status']): Task => ({
  id: `task-${status}`,
  title: 'Evidence test',
  originDept: 'marketing',
  status,
  createdAt: Date.UTC(2026, 7, 23),
  path: ['marketing'],
  eventIds: [],
  artifacts: [],
  costUsd: 0,
})

const event = (type: WorldEvent['type'], payload?: WorldEvent['payload']): WorldEvent => ({
  id: `event-${type}`,
  ts: Date.UTC(2026, 7, 23),
  type,
  title: type,
  payload,
})

test('run evidence counts typed work and artifact provenance once', () => {
  const evidence = readRunEvidence({
    events: [
      event('ToolCall'),
      event('PermissionRequest'),
      event('GuardrailBlock'),
      event('ArtifactDelivered', { simulated: true, artifact: { name: 'Brief', type: 'Memo' } }),
      event('ArtifactDelivered', { artifact: { name: 'Report', type: 'Report', content: 'Attached content' } }),
      event('ArtifactDelivered', { artifact: { name: 'Receipt', type: 'Receipt' } }),
    ],
    tasks: [task('running'), task('done')],
    executionMode: 'rehearsal',
    liveConnection: 'idle',
    runtimeInfo: null,
  })

  assert.equal(evidence.runtime, 'Local rehearsal')
  assert.equal(evidence.tasks, 2)
  assert.equal(evidence.activeTasks, 1)
  assert.equal(evidence.tools, 1)
  assert.equal(evidence.humanGates, 1)
  assert.equal(evidence.guardrails, 1)
  assert.deepEqual(evidence.artifacts, { total: 3, live: 1, rehearsal: 1, metadataOnly: 1 })
})

test('offline live evidence states that no scripted fallback is running', () => {
  const evidence = readRunEvidence({
    events: [],
    tasks: [],
    executionMode: 'live',
    liveConnection: 'disconnected',
    runtimeInfo: null,
  })

  assert.equal(evidence.runtime, 'Live backend offline')
  assert.equal(evidence.runtimeDetail, 'No scripted fallback')
})
