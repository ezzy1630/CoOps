import type { AgentCard, AgentSkill } from '@a2a-js/sdk'
import { BASE_AGENTS } from '../../../src/data/company.js'

export interface OperatorDef {
  id: string
  name: string
  dept: string
  description: string
}

export const OPERATORS: readonly OperatorDef[] = BASE_AGENTS
  .filter((a) => a.kind === 'operator')
  .map((a) => ({ id: a.id, name: a.name, dept: a.deptId, description: a.purpose }))

function skill(id: string, name: string, description: string): AgentSkill {
  return {
    id,
    name,
    description,
    tags: [id],
    examples: [],
    inputModes: ['text/plain'],
    outputModes: ['text/plain'],
    securityRequirements: [],
  }
}

export function agentCardFor(op: OperatorDef): AgentCard {
  // Path-form endpoint: the server binds dynamically (PORT=0 supported), so no
  // absolute URL is knowable at card-build time. Same-origin as the card itself.
  const endpoint = `/a2a/${op.dept}/`
  return {
    name: op.name,
    description: op.description,
    supportedInterfaces: [
      { url: endpoint, protocolBinding: 'JSONRPC', protocolVersion: '1.0', tenant: '' },
      // v0.3 interface: absent A2A-Version header defaults to '0.3' on the wire,
      // and legacyCompat method routing requires a declared 0.3 JSONRPC interface.
      { url: endpoint, protocolBinding: 'JSONRPC', protocolVersion: '0.3', tenant: '' },
    ],
    provider: undefined,
    version: '0.1.0',
    documentationUrl: undefined,
    capabilities: { streaming: false, pushNotifications: false, extensions: [] },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
    skills: [
      skill('dispatch-exchange', 'Dispatch exchange', 'Routes budget, legal, and FAQ exchanges to the right department operator and returns the artifact.'),
      skill('propose-blueprint', 'Propose blueprint', 'Interviews you and drafts a dedicated agent blueprint for any recurring job.'),
      skill('status-query', 'Status query', 'Summarizes live tasks and queue state for its department.'),
    ],
    signatures: [],
    iconUrl: undefined,
  }
}
