import type { AgentDef, Department, Person, Persona, Tool } from '../types.js'

export const COMPANY = {
  name: 'Everpeak Outfitters',
  tagline: 'Alpine gear, made to last',
}

// ─── Departments ─────────────────────────────────────────────────────────────

export const DEPARTMENTS: Department[] = [
  { id: 'marketing', name: 'Marketing', blurb: 'Campaigns, brand, launches', leadId: 'maya' },
  { id: 'finance', name: 'Finance', blurb: 'Budgets, invoices, forecasts', leadId: 'dana' },
  { id: 'legal', name: 'Legal', blurb: 'Contracts, claims, compliance', leadId: 'rob' },
  { id: 'support', name: 'Support', blurb: 'Customers, tickets, FAQs', leadId: 'sofia' },
  { id: 'operations', name: 'Operations', blurb: 'Inventory, vendors, logistics', leadId: 'sam' },
  { id: 'hr', name: 'HR', blurb: 'People, onboarding, policy', leadId: 'leo' },
]

// ─── People (the human directory) ────────────────────────────────────────────

export const PEOPLE: Person[] = [
  {
    id: 'maya', name: 'Maya Chen', role: 'Marketing Manager', deptId: 'marketing',
    initials: 'MC', hue: 330,
    owns: ['Google Drive (Marketing)', 'Launch calendar', 'Brand asset library'],
  },
  {
    id: 'dana', name: 'Dana Whitfield', role: 'Finance Operations Lead', deptId: 'finance',
    initials: 'DW', hue: 45,
    owns: ['QuickBooks account', 'Budget approvals', 'Vendor payments'],
  },
  {
    id: 'rob', name: 'Rob Alvarez', role: 'General Counsel', deptId: 'legal',
    initials: 'RA', hue: 210,
    owns: ['DocuSign account', 'Claims sign-off', 'Contract approvals'],
  },
  {
    id: 'sofia', name: 'Sofia Marsh', role: 'Head of Support', deptId: 'support',
    initials: 'SM', hue: 160,
    owns: ['Zendesk workspace', 'Macros & help center'],
  },
  {
    id: 'sam', name: 'Sam Whitcomb', role: 'Operations Director', deptId: 'operations',
    initials: 'SW', hue: 20,
    owns: ['Shopify admin', 'Warehouse systems', 'Vendor directory'],
  },
  {
    id: 'leo', name: 'Leo Tanaka', role: 'Head of People', deptId: 'hr',
    initials: 'LT', hue: 270,
    owns: ['BambooHR account', 'Offer approvals'],
  },
  {
    id: 'avery', name: 'Avery Stone', role: 'Chief Operating Officer', deptId: 'operations',
    initials: 'AS', hue: 190,
    owns: ['Company baseline policy', 'Agent budget caps'],
  },
  {
    id: 'nina', name: 'Nina Park', role: 'Support Tools Admin', deptId: 'support',
    initials: 'NP', hue: 120,
    owns: ['Zendesk API keys', 'Help-center publishing'],
  },
  {
    id: 'grace', name: 'Grace Osei', role: 'Commercial Counsel', deptId: 'legal',
    initials: 'GO', hue: 300,
    owns: ['Marketing claims review'],
  },
  {
    id: 'ethan', name: 'Ethan Cole', role: 'Brand Designer', deptId: 'marketing',
    initials: 'EC', hue: 80,
    owns: ['Figma library'],
  },
]

// ─── Tools ───────────────────────────────────────────────────────────────────

export const TOOLS: Tool[] = [
  { id: 'quickbooks', name: 'QuickBooks', kind: 'Accounting', ownerId: 'dana', deptId: 'finance', requiresAuth: true },
  { id: 'billcom', name: 'Bill.com', kind: 'Payables', ownerId: 'dana', deptId: 'finance', requiresAuth: true },
  { id: 'gdrive', name: 'Google Drive', kind: 'Files', ownerId: 'maya', deptId: 'marketing', connected: true },
  { id: 'gsheets', name: 'Google Sheets', kind: 'Spreadsheets', ownerId: 'maya', deptId: 'marketing', connected: true },
  { id: 'zendesk', name: 'Zendesk', kind: 'Support desk', ownerId: 'nina', deptId: 'support', connected: true },
  { id: 'docusign', name: 'DocuSign', kind: 'Signatures', ownerId: 'rob', deptId: 'legal', connected: true },
  { id: 'shopify', name: 'Shopify', kind: 'Commerce', ownerId: 'sam', deptId: 'operations', connected: true },
  { id: 'bamboohr', name: 'BambooHR', kind: 'HRIS', ownerId: 'leo', deptId: 'hr', connected: true },
  { id: 'slack', name: 'Slack', kind: 'Messaging', ownerId: 'avery', deptId: 'operations', connected: true },
]

// ─── Agents (operators + baseline workers) ───────────────────────────────────

export const BASE_AGENTS: AgentDef[] = [
  // Operators — internally "department operators", plain labels in the UI
  {
    id: 'op-marketing', name: 'Marketing Agent', deptId: 'marketing', kind: 'operator',
    purpose: 'Runs campaigns and launches; coordinates with Finance, Legal and Support.',
    skills: ['Campaign planning', 'Copywriting', 'Cross-team coordination'],
    toolIds: ['gdrive', 'gsheets'], ownerId: 'maya',
  },
  {
    id: 'op-finance', name: 'Finance Agent', deptId: 'finance', kind: 'operator',
    purpose: 'Owns budgets, invoices and forecasts; answers budget requests from peers.',
    skills: ['Budgeting', 'Forecasting', 'Invoice processing'],
    toolIds: ['quickbooks', 'gsheets'], ownerId: 'dana',
  },
  {
    id: 'op-legal', name: 'Legal Agent', deptId: 'legal', kind: 'operator',
    purpose: 'Reviews contracts and marketing claims; routes sign-offs to counsel.',
    skills: ['Contract review', 'Claims compliance', 'Policy watch'],
    toolIds: ['docusign'], ownerId: 'rob',
  },
  {
    id: 'op-support', name: 'Support Agent', deptId: 'support', kind: 'operator',
    purpose: 'Keeps customers unblocked; maintains FAQs, macros and the help center.',
    skills: ['Ticket triage', 'FAQ authoring', 'Escalation handling'],
    toolIds: ['zendesk'], ownerId: 'sofia',
  },
  {
    id: 'op-operations', name: 'Operations Agent', deptId: 'operations', kind: 'operator',
    purpose: 'Watches inventory, vendors and logistics for the whole company.',
    skills: ['Inventory sync', 'Vendor management', 'Logistics'],
    toolIds: ['shopify', 'slack'], ownerId: 'sam',
  },
  {
    id: 'op-hr', name: 'HR Agent', deptId: 'hr', kind: 'operator',
    purpose: 'Runs onboarding and people processes with strict data scoping.',
    skills: ['Onboarding', 'Policy Q&A'],
    toolIds: ['bamboohr'], ownerId: 'leo',
  },

  // Workers
  {
    id: 'w-copy', name: 'Campaign Copy Agent', deptId: 'marketing', kind: 'worker',
    purpose: 'Drafts campaign copy from briefs; hands drafts to humans for review.',
    skills: ['Copywriting', 'Tone matching'], toolIds: ['gdrive'], ownerId: 'maya',
  },
  {
    id: 'w-social', name: 'Social Scheduler', deptId: 'marketing', kind: 'worker',
    purpose: 'Schedules approved posts across channels.',
    skills: ['Scheduling'], toolIds: ['gdrive'], ownerId: 'ethan',
  },
  {
    id: 'w-invoice', name: 'Invoice Triage Agent', deptId: 'finance', kind: 'worker',
    purpose: 'Classifies inbound invoices and flags anomalies.',
    skills: ['OCR', 'Anomaly detection'], toolIds: ['quickbooks'], ownerId: 'dana',
  },
  {
    id: 'w-budget', name: 'Budget Model Agent', deptId: 'finance', kind: 'worker',
    purpose: 'Maintains the rolling budget model; answers budget queries.',
    skills: ['Modeling', 'Variance analysis'], toolIds: ['quickbooks', 'gsheets'], ownerId: 'dana',
  },
  {
    id: 'w-contract', name: 'Contract Review Agent', deptId: 'legal', kind: 'worker',
    purpose: 'First-pass contract review against the Everpeak playbook.',
    skills: ['Clause extraction', 'Risk flags'], toolIds: ['docusign'], ownerId: 'rob',
  },
  {
    id: 'w-policy', name: 'Policy Watch Agent', deptId: 'legal', kind: 'worker',
    purpose: 'Monitors ad and consumer-claims regulations for changes.',
    skills: ['Regulatory watch'], toolIds: [], ownerId: 'grace',
  },
  {
    id: 'w-faq', name: 'FAQ Agent', deptId: 'support', kind: 'worker',
    purpose: 'Drafts and updates help-center FAQs from product changes.',
    skills: ['FAQ authoring'], toolIds: ['zendesk'], ownerId: 'sofia',
  },
  {
    id: 'w-triage', name: 'Ticket Triage Agent', deptId: 'support', kind: 'worker',
    purpose: 'Routes tickets, drafts replies, escalates edge cases.',
    skills: ['Triage', 'Reply drafting'], toolIds: ['zendesk'], ownerId: 'nina',
  },
  {
    id: 'w-inventory', name: 'Inventory Sync Agent', deptId: 'operations', kind: 'worker',
    purpose: 'Reconciles Shopify stock against warehouse counts nightly.',
    skills: ['Reconciliation'], toolIds: ['shopify'], ownerId: 'sam',
  },
  {
    id: 'w-vendor', name: 'Vendor Follow-up Agent', deptId: 'operations', kind: 'worker',
    purpose: 'Chases vendor confirmations and delivery dates.',
    skills: ['Email follow-up'], toolIds: ['slack'], ownerId: 'sam',
  },
  {
    id: 'w-onboard', name: 'Onboarding Agent', deptId: 'hr', kind: 'worker',
    purpose: 'Runs the new-hire checklist end to end.',
    skills: ['Checklists', 'Scheduling'], toolIds: ['bamboohr'], ownerId: 'leo',
  },
]

// ─── Personas (role-aware entry) ─────────────────────────────────────────────

export const PERSONAS: Persona[] = [
  {
    personId: 'maya', label: 'Marketing Manager',
    description: 'Land in your department. Ask your agent for work, or a new agent.',
    entry: 'department',
  },
  {
    personId: 'avery', label: 'Chief Operating Officer',
    description: 'See the whole company at once: every department, every live task.',
    entry: 'admin',
  },
  {
    personId: 'dana', label: 'Finance Ops Lead',
    description: 'You own credentials and budget approvals. Blocked work finds you.',
    entry: 'approver',
  },
]

// ─── Lookups ─────────────────────────────────────────────────────────────────

export const personById = new Map(PEOPLE.map((p) => [p.id, p]))
export const deptById = new Map(DEPARTMENTS.map((d) => [d.id, d]))
export const toolById = new Map(TOOLS.map((t) => [t.id, t]))

/** Agent id → department id, derived from BASE_AGENTS. */
export const AGENT_DEPT: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(BASE_AGENTS.map((a) => [a.id, a.deptId])),
})
