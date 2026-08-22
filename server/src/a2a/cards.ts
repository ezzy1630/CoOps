import type { AgentCard, AgentSkill } from '@a2a-js/sdk'

export interface OperatorDef {
  id: string
  name: string
  dept: string
  description: string
}

export const OPERATORS: readonly OperatorDef[] = [
  {
    id: 'op-marketing',
    name: 'Marketing Agent',
    dept: 'marketing',
    description: 'Runs marketing work end to end — campaigns, launch briefs, and cross-department coordination.',
  },
  {
    id: 'op-finance',
    name: 'Finance Agent',
    dept: 'finance',
    description: 'Owns budgets, invoicing, and spend questions, including the Q3 ledger position.',
  },
  {
    id: 'op-legal',
    name: 'Legal Agent',
    dept: 'legal',
    description: 'Handles claims checks, contract reviews, compliance, and policy questions.',
  },
  {
    id: 'op-support',
    name: 'Support Agent',
    dept: 'support',
    description: 'Preps customer FAQs, triages tickets, and runs the help-center pipeline.',
  },
  {
    id: 'op-operations',
    name: 'Operations Agent',
    dept: 'operations',
    description: 'Keeps inventory, vendors, and day-to-day operational workflows moving.',
  },
  {
    id: 'op-hr',
    name: 'HR Agent',
    dept: 'hr',
    description: 'Onboards new hires and coordinates people workflows across teams.',
  },
]

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
