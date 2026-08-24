import type { CompanyTemplate } from '../company.js'
import type { AgentDef, Department, Person, Persona, Tool } from '../../types.js'

// Horse Launch Co — the launch-day campaign company. Engineering owns the
// developer machines where the stranded video lives; Marketing owns the
// objective and the YouTube channel approval.

const DEPARTMENTS: Department[] = [
  { id: 'marketing', name: 'Marketing', blurb: 'Launches, brand, campaigns', leadId: 'maya' },
  { id: 'finance', name: 'Finance', blurb: 'Budgets, invoices, forecasts', leadId: 'dana' },
  { id: 'legal', name: 'Legal', blurb: 'Contracts, claims, compliance', leadId: 'rob' },
  { id: 'support', name: 'Support', blurb: 'Customers, tickets, FAQs', leadId: 'sofia' },
  { id: 'hr', name: 'HR', blurb: 'People, onboarding, policy', leadId: 'leo' },
  { id: 'engineering', name: 'Engineering', blurb: 'Builds the product; owns dev machines', leadId: 'alex' },
]

const PEOPLE: Person[] = [
  {
    id: 'maya', name: 'Maya Chen', role: 'GTM Lead', deptId: 'marketing',
    initials: 'MC', hue: 330,
    owns: ['YouTube channel', 'Google Drive (Marketing)', 'Launch calendar'],
  },
  {
    id: 'alex', name: 'Alex Rivera', role: 'Senior Engineer', deptId: 'engineering',
    initials: 'AR', hue: 15,
    owns: ["Alex's laptop", 'Allow-listed export directory'],
  },
  {
    id: 'dana', name: 'Dana Whitfield', role: 'Finance Operations Lead', deptId: 'finance',
    initials: 'DW', hue: 45,
    owns: ['QuickBooks account', 'Budget approvals'],
  },
  {
    id: 'rob', name: 'Rob Alvarez', role: 'General Counsel', deptId: 'legal',
    initials: 'RA', hue: 210,
    owns: ['Claims sign-off', 'Contract approvals'],
  },
  {
    id: 'sofia', name: 'Sofia Marsh', role: 'Head of Support', deptId: 'support',
    initials: 'SM', hue: 160,
    owns: ['Zendesk workspace', 'Help center'],
  },
  {
    id: 'leo', name: 'Leo Tanaka', role: 'Head of People', deptId: 'hr',
    initials: 'LT', hue: 270,
    owns: ['BambooHR account', 'Offer approvals'],
  },
  {
    id: 'avery', name: 'Avery Stone', role: 'Chief Operating Officer', deptId: 'engineering',
    initials: 'AS', hue: 190,
    owns: ['Company baseline policy', 'Agent budget caps'],
  },
  {
    id: 'nina', name: 'Nina Park', role: 'Support Tools Admin', deptId: 'support',
    initials: 'NP', hue: 120,
    owns: ['Zendesk API keys'],
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
  { id: 'youtube', name: 'YouTube', kind: 'Publishing', ownerId: 'maya', deptId: 'marketing', requiresAuth: true },
  { id: 'zendesk', name: 'Zendesk', kind: 'Support desk', ownerId: 'nina', deptId: 'support', connected: true },
  { id: 'docusign', name: 'DocuSign', kind: 'Signatures', ownerId: 'rob', deptId: 'legal', connected: true },
  { id: 'bamboohr', name: 'BambooHR', kind: 'HRIS', ownerId: 'leo', deptId: 'hr', connected: true },
  { id: 'slack', name: 'Slack', kind: 'Messaging', ownerId: 'avery', deptId: 'engineering', connected: true },
  { id: 'devlaptop', name: 'Developer Laptop', kind: 'Local connector', ownerId: 'alex', deptId: 'engineering', requiresAuth: true },
]

const BASE_AGENTS: AgentDef[] = [
  {
    id: 'op-marketing', name: 'Marketing Agent', deptId: 'marketing', kind: 'operator',
    purpose: 'Owns launch objectives and routes work to peer departments.',
    skills: ['Campaign planning', 'Cross-team coordination'],
    toolIds: ['gdrive', 'gsheets', 'youtube'], ownerId: 'maya',
  },
  {
    id: 'op-engineering', name: 'Engineering Agent', deptId: 'engineering', kind: 'operator',
    purpose: 'Owns developer machines and the allow-listed export directory.',
    skills: ['Local search', 'Checksum verification', 'Build tooling'],
    toolIds: ['devlaptop'], ownerId: 'alex',
  },
  {
    id: 'op-finance', name: 'Finance Agent', deptId: 'finance', kind: 'operator',
    purpose: 'Owns budgets, invoices and forecasts; answers budget requests from peers.',
    skills: ['Budgeting', 'Invoice processing'],
    toolIds: ['quickbooks', 'billcom'], ownerId: 'dana',
  },
  {
    id: 'op-legal', name: 'Legal Agent', deptId: 'legal', kind: 'operator',
    purpose: 'Reviews contracts and marketing claims; routes sign-offs to counsel.',
    skills: ['Contract review', 'Claims compliance'],
    toolIds: ['docusign'], ownerId: 'rob',
  },
  {
    id: 'op-support', name: 'Support Agent', deptId: 'support', kind: 'operator',
    purpose: 'Keeps customers unblocked; maintains FAQs and the help center.',
    skills: ['Ticket triage', 'FAQ authoring'],
    toolIds: ['zendesk'], ownerId: 'sofia',
  },
  {
    id: 'op-hr', name: 'HR Agent', deptId: 'hr', kind: 'operator',
    purpose: 'Runs onboarding and people processes with strict data scoping.',
    skills: ['Onboarding', 'Policy Q&A'],
    toolIds: ['bamboohr'], ownerId: 'leo',
  },
  {
    id: 'w-horse', name: 'Horse Launch Agent', deptId: 'marketing', kind: 'worker',
    purpose: 'Carries the launch video from a developer laptop to YouTube end to end.',
    skills: ['Media handoff', 'Provenance tracking'], toolIds: ['gdrive', 'youtube'], ownerId: 'maya',
  },
  {
    id: 'w-connector', name: 'Developer Machine Connector', deptId: 'engineering', kind: 'worker',
    purpose: 'Scans the allow-listed export directory and verifies file checksums.',
    skills: ['Allow-listed scan', 'Checksum verification'], toolIds: ['devlaptop'], ownerId: 'alex',
  },
  {
    id: 'w-copy', name: 'Campaign Copy Agent', deptId: 'marketing', kind: 'worker',
    purpose: 'Drafts campaign copy from briefs; hands drafts to humans for review.',
    skills: ['Copywriting', 'Tone matching'], toolIds: ['gdrive'], ownerId: 'ethan',
  },
  {
    id: 'w-invoice', name: 'Invoice Triage Agent', deptId: 'finance', kind: 'worker',
    purpose: 'Classifies inbound invoices and flags anomalies.',
    skills: ['OCR', 'Anomaly detection'], toolIds: ['quickbooks'], ownerId: 'dana',
  },
  {
    id: 'w-contract', name: 'Contract Review Agent', deptId: 'legal', kind: 'worker',
    purpose: 'First-pass contract review against the claims playbook.',
    skills: ['Clause extraction', 'Risk flags'], toolIds: ['docusign'], ownerId: 'rob',
  },
  {
    id: 'w-faq', name: 'FAQ Agent', deptId: 'support', kind: 'worker',
    purpose: 'Drafts and updates help-center FAQs from product changes.',
    skills: ['FAQ authoring'], toolIds: ['zendesk'], ownerId: 'sofia',
  },
  {
    id: 'w-onboard', name: 'Onboarding Agent', deptId: 'hr', kind: 'worker',
    purpose: 'Runs the new-hire checklist end to end.',
    skills: ['Checklists', 'Scheduling'], toolIds: ['bamboohr'], ownerId: 'leo',
  },
]

const PERSONAS: Persona[] = [
  {
    personId: 'maya', label: 'GTM Lead',
    description: "Land in your department. Ask your agent to find Alex's video and publish it.",
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

export const horse: CompanyTemplate = {
  name: 'Horse Launch Co',
  tagline: 'Neigh-borly launches, done right',
  departments: DEPARTMENTS,
  people: PEOPLE,
  agents: BASE_AGENTS,
  tools: TOOLS,
  personas: PERSONAS,
  valley: {
    world: { w: 960, h: 600 },
    plaza: { x: 480, y: 280 },
    background: '/pixel/horse/background.png',
    backgroundBox: { x: -240, y: -300, w: 1440, h: 1200 },
    mail: '/pixel/horse/mail.png',
    buildings: [
      { deptId: 'marketing', img: '/pixel/horse/buildings/marketing.png', x: 138, y: 70, w: 100, h: 84, door: { x: 190, y: 160 } },
      { deptId: 'finance', img: '/pixel/horse/buildings/finance.png', x: 418, y: 42, w: 120, h: 100, door: { x: 480, y: 146 } },
      { deptId: 'legal', img: '/pixel/horse/buildings/legal.png', x: 716, y: 64, w: 116, h: 98, door: { x: 778, y: 166 } },
      { deptId: 'support', img: '/pixel/horse/buildings/support.png', x: 136, y: 320, w: 108, h: 92, door: { x: 194, y: 416 } },
      { deptId: 'hr', img: '/pixel/horse/buildings/hr.png', x: 424, y: 420, w: 108, h: 90, door: { x: 482, y: 514 } },
      { deptId: 'engineering', img: '/pixel/horse/buildings/engineering.png', x: 691, y: 336, w: 104, h: 92, door: { x: 774, y: 420 } },
    ],
    avatars: {
      cell: 24,
      frameOrder: ['down0', 'down1', 'up0', 'up1', 'right0', 'right1'],
      variants: [
        '/pixel/horse/avatars/v0.png',
        '/pixel/horse/avatars/v1.png',
        '/pixel/horse/avatars/v2.png',
        '/pixel/horse/avatars/v3.png',
        '/pixel/horse/avatars/v4.png',
        '/pixel/horse/avatars/v5.png',
        '/pixel/horse/avatars/v6.png',
        '/pixel/horse/avatars/v7.png',
      ],
    },
    emotes: {
      cell: 16,
      files: {
        working: '/pixel/horse/emotes/working.png',
        blocked: '/pixel/horse/emotes/blocked.png',
        awaiting: '/pixel/horse/emotes/awaiting.png',
        escalated: '/pixel/horse/emotes/escalated.png',
        delivering: '/pixel/horse/emotes/delivering.png',
        reading: '/pixel/horse/emotes/reading.png',
      },
    },
  },
}