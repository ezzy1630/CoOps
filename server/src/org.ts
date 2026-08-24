import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AgentDef, Department, WorldEvent } from '../../src/types.js'
import { getAgents, getDepartments, setCompanyTemplate, AGENT_DEPT } from '../../src/data/company.js'
import { everpeak } from '../../src/data/companies/everpeak.js'

// Backend and client register the same single company definition; the valley
// asset paths are inert strings here.
setCompanyTemplate(everpeak)

type Appendable = Omit<WorldEvent, 'id' | 'ts'> & Partial<Pick<WorldEvent, 'id' | 'ts'>>

export class OrgRegistry {
  private departments: Department[]
  private agents: AgentDef[]
  private readonly file: string
  constructor(dataDir: string, private persist: (e: Appendable) => Promise<WorldEvent>) {
    this.departments = [...getDepartments()]
    this.agents = [...getAgents()]
    this.file = join(dataDir, 'org.json')
  }

  async load(): Promise<void> {
    let raw: string
    try {
      raw = await readFile(this.file, 'utf8')
    } catch {
      return
    }
    try {
      const saved = JSON.parse(raw) as Partial<{ departments: Department[]; agents: AgentDef[] }>
      if (Array.isArray(saved.departments)) this.departments = saved.departments
      if (Array.isArray(saved.agents)) this.agents = saved.agents
    } catch {}
  }

  list(): { departments: Department[]; agents: AgentDef[] } {
    return { departments: [...this.departments], agents: [...this.agents] }
  }

  get(deptId: string): { department: Department; operator: AgentDef } | undefined {
    const department = this.departments.find(d => d.id === deptId)
    const operator = department ? this.agents.find(a => a.deptId === deptId && a.kind === 'operator') : undefined
    return department && operator ? { department, operator } : undefined
  }

  deptOfAgent(agentId: string): string {
    // untracked ids fall back to the static seed map (e.g. the launch worker,
    // spawned by the demo flow before any registry registration exists)
    return this.agents.find(a => a.id === agentId)?.deptId ?? AGENT_DEPT[agentId] ?? ''
  }

  async add(name: string, blurb: string): Promise<{ department: Department; operator: AgentDef }> {
    const id = slugify(name)
    if (this.departments.some(d => d.id === id)) throw new Error(`department '${id}' already exists`)
    const department: Department = { id, name, blurb: blurb || `${name} operations`, leadId: 'avery' }
    const operator: AgentDef = {
      id: `op-${id}`,
      name: `${name} Agent`,
      deptId: id,
      kind: 'operator',
      purpose: `Runs ${name} operations; coordinates its workers and peers.`,
      skills: [],
      toolIds: [],
      ownerId: 'avery',
    }
    this.departments.push(department)
    this.agents.push(operator)
    await this.persist({
      type: 'DeptAdded',
      from: { kind: 'system', id: 'org' },
      deptFrom: id,
      deptTo: id,
      title: `${name} department added`,
      payload: { department, agent: operator },
    })
    await this.save()
    return { department, operator }
  }

  async remove(deptId: string): Promise<Department | undefined> {
    const department = this.departments.find(d => d.id === deptId)
    if (!department) return undefined
    this.departments = this.departments.filter(d => d.id !== deptId)
    this.agents = this.agents.filter(a => a.deptId !== deptId)
    await this.persist({
      type: 'DeptRemoved',
      from: { kind: 'system', id: 'org' },
      deptFrom: deptId,
      title: `${department.name} department removed`,
      payload: { department },
    })
    await this.save()
    return department
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true })
    await writeFile(this.file, JSON.stringify({ departments: this.departments, agents: this.agents }), 'utf8')
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dept'
}
