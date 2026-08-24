import type { CompanyTemplate } from '../company.js'
import type { AgentDef, Department, Person, Persona, Tool } from '../../types.js'

// Everpeak Outfitters - the default company injected into the app by activeCompany.ts.

const COMPANY = { name: 'Everpeak Outfitters', tagline: 'Alpine gear, made to last' }

const DEPARTMENTS: Department[] = [
  { id: 'marketing', name: 'Marketing', blurb: 'Campaigns, brand, launches', leadId: 'maya' },
  { id: 'finance', name: 'Finance', blurb: 'Budgets, invoices, forecasts', leadId: 'dana' },
  { id: 'legal', name: 'Legal', blurb: 'Contracts, claims, compliance', leadId: 'rob' },
  { id: 'support', name: 'Support', blurb: 'Customers, tickets, FAQs', leadId: 'sofia' },
  { id: 'operations', name: 'Operations', blurb: 'Inventory, vendors, logistics', leadId: 'sam' },
  { id: 'hr', name: 'HR', blurb: 'People, onboarding, policy', leadId: 'leo' },
]

const PEOPLE: Person[] = [
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

const TOOLS: Tool[] = [
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

const BASE_AGENTS: AgentDef[] = [
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

const PERSONAS: Persona[] = [
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

/** Everpeak Outfitters - roster plus Valley asset paths and geometry.
 *  PNGs are generated once by scripts/gen-pixel-art.mjs --company=everpeak
 *  into public/pixel/everpeak/ and served statically. The same definition
 *  registers on both client and backend. */
export const everpeak: CompanyTemplate = {
  name: COMPANY.name,
  tagline: COMPANY.tagline,
  departments: DEPARTMENTS,
  people: PEOPLE,
  agents: BASE_AGENTS,
  tools: TOOLS,
  personas: PERSONAS,
  valley: {
    world: { w: 960, h: 600 },
    plaza: { x: 480, y: 280 },
    background: '/pixel/everpeak/background.png',
    backgroundBox: { x: -240, y: -300, w: 1440, h: 1200 },
    mail: '/pixel/everpeak/mail.png',
    buildings: [
      { deptId: 'marketing', img: '/pixel/everpeak/buildings/marketing.png', x: 140, y: 70, w: 96, h: 84, door: { x: 188, y: 160 } },
      { deptId: 'finance', img: '/pixel/everpeak/buildings/finance.png', x: 420, y: 45, w: 120, h: 100, door: { x: 480, y: 145 } },
      { deptId: 'legal', img: '/pixel/everpeak/buildings/legal.png', x: 720, y: 65, w: 112, h: 96, door: { x: 776, y: 165 } },
      { deptId: 'support', img: '/pixel/everpeak/buildings/support.png', x: 140, y: 320, w: 104, h: 92, door: { x: 192, y: 415 } },
      { deptId: 'operations', img: '/pixel/everpeak/buildings/operations.png', x: 710, y: 310, w: 124, h: 108, door: { x: 772, y: 420 } },
      { deptId: 'hr', img: '/pixel/everpeak/buildings/hr.png', x: 428, y: 420, w: 104, h: 88, door: { x: 480, y: 510 } },
    ],
    avatars: {
      cell: 24,
      frameOrder: ['down0', 'down1', 'up0', 'up1', 'right0', 'right1'],
      variants: [
        '/pixel/everpeak/avatars/v0.png',
        '/pixel/everpeak/avatars/v1.png',
        '/pixel/everpeak/avatars/v2.png',
        '/pixel/everpeak/avatars/v3.png',
        '/pixel/everpeak/avatars/v4.png',
        '/pixel/everpeak/avatars/v5.png',
        '/pixel/everpeak/avatars/v6.png',
        '/pixel/everpeak/avatars/v7.png',
      ],
    },
    emotes: {
      cell: 16,
      files: {
        working: '/pixel/everpeak/emotes/working.png',
        blocked: '/pixel/everpeak/emotes/blocked.png',
        awaiting: '/pixel/everpeak/emotes/awaiting.png',
        escalated: '/pixel/everpeak/emotes/escalated.png',
        delivering: '/pixel/everpeak/emotes/delivering.png',
        reading: '/pixel/everpeak/emotes/reading.png',
      },
    },
  },
}
