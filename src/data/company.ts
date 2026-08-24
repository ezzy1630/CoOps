import type { AgentDef, Department, Person, Persona, Tool } from '../types.js'

// ─── CompanyTemplate: the single injected definition of one company ─────────
// Core code never names a company, department, person, or asset. Everything
// below is injected by src/data/activeCompany.ts at module load.

export type ValleyEmoteName = 'working' | 'blocked' | 'awaiting' | 'escalated' | 'delivering' | 'reading'

export interface ValleyBuildingAsset {
  deptId: string
  /** bundled image url */
  img: string
  x: number
  y: number
  w: number
  h: number
  door: { x: number; y: number }
}

export interface ValleyAssets {
  world: { w: number; h: number }
  /** bundled image url */
  background: string
  /** where the background image sits in world coordinates (decorative bleed) */
  backgroundBox: { x: number; y: number; w: number; h: number }
  plaza: { x: number; y: number }
  buildings: ValleyBuildingAsset[]
  avatars: { cell: number; frameOrder: string[]; variants: string[] }
  emotes: { cell: number; files: Record<ValleyEmoteName, string> }
  mail: string
}

export interface CompanyTemplate {
  name: string
  tagline: string
  departments: Department[]
  people: Person[]
  agents: AgentDef[]
  tools: Tool[]
  personas: Persona[]
  /** Pre-generated Valley assets (client-side rendering only). A backend-only
   *  registration omits this; the renderer reports 'missing' without it. */
  valley?: ValleyAssets
}

// ─── Runtime state ───────────────────────────────────────────────────────────
// Maps keep stable object identities so existing lookups keep working.

export const deptById = new Map<string, Department>()
export const personById = new Map<string, Person>()
export const toolById = new Map<string, Tool>()
/** Agent id → department id. */
export const AGENT_DEPT: Readonly<Record<string, string>> = new Proxy(
  {} as Record<string, string>,
  {
    get: (_target, prop: string) => agentDeptMap.get(prop),
    ownKeys: () => [...agentDeptMap.keys()],
    getOwnPropertyDescriptor: (_t, prop) =>
      agentDeptMap.has(prop as string) ? { enumerable: true, configurable: true, value: agentDeptMap.get(prop as string) } : undefined,
  },
)
const agentDeptMap = new Map<string, string>()

let current: CompanyTemplate | null = null

export function setCompanyTemplate(t: CompanyTemplate): void {
  current = t
  const swap = <T extends { id: string }>(map: Map<string, T>, items: T[]) => {
    map.clear()
    for (const item of items) map.set(item.id, item)
  }
  swap(deptById, t.departments)
  swap(personById, t.people)
  swap(toolById, t.tools)
  agentDeptMap.clear()
  for (const a of t.agents) agentDeptMap.set(a.id, a.deptId)
}

export function getCompany(): CompanyTemplate {
  if (!current) throw new Error('Company not registered. Import src/data/activeCompany before using company data.')
  return current
}

export const getDepartments = (): Department[] => getCompany().departments
export const getPeople = (): Person[] => getCompany().people
export const getAgents = (): AgentDef[] => getCompany().agents
export const getTools = (): Tool[] => getCompany().tools
export const getPersonas = (): Persona[] => getCompany().personas
