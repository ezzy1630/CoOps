import type { AgentDef, Task, WorldEvent } from '../types.js'
import { BASE_AGENTS, deptById, personById } from './company.js'
import { between, mulberry32, pick, type Rng } from '../engine/rng.js'
import type { ArtifactDoc, ArtifactTemplate, ClaimItem, DocBlock, DocType } from '../artifacts/document.js'

export type { ArtifactDoc, ArtifactTemplate, ClaimItem, DocBlock, DocType } from '../artifacts/document.js'

/**
 * Turns an ArtifactDelivered event into a structured internal document —
 * the actual memo / table / FAQ a judge can read. Attached live content and
 * templates take precedence; known generic titles use deterministic content,
 * and anything else falls back to a document seeded from the title + task id.
 * No Math.random anywhere: same event → same document, every render.
 */

// ─── Small deterministic helpers ─────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const int = (rng: Rng, min: number, max: number) => Math.round(between(rng, min, max))

const usd = (n: number, cents = true) =>
  '$' +
  n.toLocaleString('en-US', cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 })

const longDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const shortDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function nextMonday(ts: number): number {
  const d = new Date(ts)
  const add = (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + add)
  return d.getTime()
}

const DAY = 86_400_000

/** payload.artifact may be a bare string or {name, type} depending on emitter. */
export function artifactEventName(e: WorldEvent): string {
  const a = e.payload?.artifact as unknown
  if (typeof a === 'string') return a
  if (a && typeof a === 'object' && 'name' in a) return String((a as { name: unknown }).name)
  return e.title.replace(/^Delivered:\s*/i, '')
}

function artifactEventType(e: WorldEvent): string {
  const a = e.payload?.artifact as unknown
  if (a && typeof a === 'object' && 'type' in a) return String((a as { type: unknown }).type)
  return 'Document'
}

// ─── Build context ───────────────────────────────────────────────────────────

interface Ctx {
  ev: WorldEvent
  task?: Task
  name: string
  type: string
  rng: Rng
  h: number
  preparedBy: string
  desk: string
  recipientDesk: string
  meta: string[]
}

function makeCtx(ev: WorldEvent, task: Task | undefined, agents: AgentDef[]): Ctx {
  const name = artifactEventName(ev)
  const type = artifactEventType(ev)
  const h = hashStr(`${ev.taskId ?? ev.id}|${name}`)
  const rng = mulberry32(h)

  let preparedBy = 'Department Agent'
  if (ev.from?.kind === 'agent') {
    preparedBy = agents.find((a) => a.id === ev.from!.id)?.name ?? preparedBy
  } else if (ev.from?.kind === 'person') {
    preparedBy = personById.get(ev.from.id)?.name ?? preparedBy
  } else if (ev.from?.kind === 'system') {
    preparedBy = 'Agent Gateway'
  }

  const desk = (ev.deptFrom && deptById.get(ev.deptFrom)?.name) ?? 'Company'
  const recipientDesk = `${(ev.deptTo && deptById.get(ev.deptTo)?.name) ?? desk} desk`

  const meta = [
    ...(ev.taskId ? [ev.taskId] : []),
    longDate(ev.ts),
    `Prepared by ${preparedBy} — ${desk} desk`,
  ]
  return { ev, task, name, type, rng, h, preparedBy, desk, recipientDesk, meta }
}

const doc = (c: Ctx, docType: DocType, label: string, blocks: DocBlock[], title?: string): ArtifactDoc => ({
  docType,
  label,
  title: title ?? c.name,
  meta: c.meta,
  blocks,
  recipientDesk: c.recipientDesk,
})

const templateDoc = (c: Ctx, template: ArtifactTemplate): ArtifactDoc =>
  doc(c, template.docType, template.label, template.blocks, template.title)

// ─── Finance: vendor payment confirmation ────────────────────────────────────

const VENDOR_LINES: Record<string, [string, string]> = {
  'TrailWeave Fabrics': ['3-layer shell fabric — 480 yd roll', 'Ripstop liner, 70D — 210 yd'],
  'Cascade Zippers': ['Water-resistant zips, #5 — 1,400 units', 'Cord pulls, molded — 2,800 units'],
  'NorthShore Foam': ['EVA back-panel foam — 60 sheets', 'Shoulder-harness foam — 90 sheets'],
  'Alpenglow Dyeworks': ['Low-impact dye lot — juniper green', 'Dye lot — ember orange'],
}

function paymentDoc(c: Ctx): ArtifactDoc {
  const inv = c.name.match(/#(\d+)/)?.[1] ?? String(8000 + (c.h % 1900))
  const vendor = c.task?.title.match(/(?:—|:)\s*(.+)$/)?.[1] ?? 'the vendor'
  const lines = VENDOR_LINES[vendor] ?? ['Materials per purchase order', 'Packaging & handling']
  const a1 = int(c.rng, 2800, 13500) + int(c.rng, 0, 99) / 100
  const a2 = int(c.rng, 900, 5200) + int(c.rng, 0, 99) / 100
  const freight = int(c.rng, 180, 640) + int(c.rng, 0, 99) / 100
  const total = a1 + a2 + freight
  const po = `PO-EP-${3100 + (c.h % 850)}`

  return doc(c, 'table', 'PAYMENT CONFIRMATION', [
    {
      kind: 'fields',
      rows: [
        { k: 'Vendor', v: vendor },
        { k: 'Invoice', v: `#${inv}` },
        { k: 'PO reference', v: po },
        { k: 'Method', v: 'ACH · operating account ····4417' },
        { k: 'Cleared', v: longDate(c.ev.ts) },
      ],
    },
    {
      kind: 'table',
      columns: ['Line item', 'Amount'],
      align: ['l', 'r'],
      rows: [
        [lines[0], usd(a1)],
        [lines[1], usd(a2)],
        ['Freight & fuel surcharge', usd(freight)],
      ],
      footRows: [{ cells: ['Invoice total — paid in full', usd(total)], strong: true }],
      note: `Matched to receiving report ${po} by Invoice Triage · no variances flagged.`,
    },
    {
      kind: 'para',
      text: `Payment against invoice #${inv} cleared the operating account this morning. Line items reconcile to the receiving report within tolerance, and the vendor portal shows the remittance as received.`,
    },
    { kind: 'note', text: 'Shipment hold released — Operations can schedule the pickup window with the carrier.', tone: 'human' },
  ])
}

// ─── Legal: claims review ────────────────────────────────────────────────────

interface ClaimsPack {
  scope: string
  items: ClaimItem[]
}

const CLAIM_PACKS: Record<string, ClaimsPack> = {
  waterproofing: {
    scope: 'the waterproofing social post',
    items: [
      {
        claim: 'stays dry in any storm',
        verdict: 'redlined',
        replacement: 'waterproof to 20,000 mm hydrostatic head — tested to stay dry in sustained heavy rain',
        note: 'Absolute performance promise. “Any storm” cannot be substantiated; tie the claim to the lab rating.',
      },
      { claim: 'fully taped seams', verdict: 'cleared', note: 'Factual, matches the construction spec on file.' },
      { claim: 'DWR finish sheds light rain', verdict: 'cleared', note: 'Qualified and consistent with test results.' },
    ],
  },
  durability: {
    scope: 'the durability reel',
    items: [
      {
        claim: 'outlasts anything on the trail',
        verdict: 'redlined',
        replacement: 'built on 210-denier ripstop, bar-tacked at every stress point — and backed by our lifetime repair program',
        note: 'Unsubstantiated market-wide superiority. Anchor to construction facts and the repair program instead.',
      },
      { claim: 'bar-tacked at every stress point', verdict: 'cleared', note: 'Verifiable against the tech pack.' },
      { claim: 'covered by the lifetime repair program', verdict: 'cleared', note: 'Program terms already published.' },
    ],
  },
  insulation: {
    scope: 'the insulation ad',
    items: [
      {
        claim: 'warm at −20°',
        verdict: 'redlined',
        replacement: 'rated to a −20 °F comfort limit under EN 23537 lab conditions',
        note: 'Temperature claims must cite the test standard; individual results vary with layering and wind.',
      },
      { claim: '800-fill responsibly sourced down', verdict: 'cleared', note: 'RDS certificate #RDS-2214 on file.' },
      { claim: 'windproof outer shell', verdict: 'cleared', note: 'Supported by fabric permeability testing.' },
    ],
  },
  recycled: {
    scope: 'the recycled-materials page',
    items: [
      {
        claim: '100% recycled shell',
        verdict: 'redlined',
        replacement: 'shell fabric made with 87% recycled content by weight (2025 supplier audit)',
        note: 'FTC Green Guides: recycled-content percentages must match the audited supply figure.',
      },
      { claim: 'bluesign-approved mill partners', verdict: 'cleared', note: 'Partner list current as of Q2.' },
      { claim: 'PFC-free durable water repellent', verdict: 'cleared', note: 'Chemistry disclosure on file.' },
    ],
  },
}

const GENERIC_CLAIMS: ClaimsPack = {
  scope: 'the submitted copy',
  items: [
    {
      claim: 'the best gear on the mountain',
      verdict: 'redlined',
      replacement: 'trusted by working mountain guides since 2014',
      note: 'Unsubstantiated superlative; replace with the verifiable endorsement history.',
    },
    { claim: 'performance ratings as stated on spec sheets', verdict: 'cleared', note: 'All figures trace to lab reports.' },
    { claim: 'warranty and repair language', verdict: 'cleared', note: 'Matches the published program terms.' },
  ],
}

function claimsNoteDoc(c: Ctx): ArtifactDoc {
  const title = c.task?.title.toLowerCase() ?? ''
  const key = Object.keys(CLAIM_PACKS).find((k) => title.includes(k))
  const pack = key ? CLAIM_PACKS[key] : GENERIC_CLAIMS
  // if the objective quotes a specific claim, make sure it leads the review
  const quoted = c.task?.objective?.match(/[“"]([^”"]+)[”"]/)?.[1]
  const items = [...pack.items]
  if (quoted && !items.some((i) => i.claim === quoted)) {
    items[0] = { ...items[0], claim: quoted }
  }

  return doc(c, 'memo', 'CLAIMS REVIEW', [
    {
      kind: 'para',
      text: `Reviewed ${pack.scope} against FTC substantiation guidance and the Everpeak claims playbook (v4). ${items.length} claims examined; ${items.filter((i) => i.verdict === 'cleared').length} cleared as written, ${items.filter((i) => i.verdict === 'redlined').length} redlined with suggested wording below.`,
    },
    { kind: 'claims', items },
    {
      kind: 'para',
      text: 'No other blockers. If the copy changes materially before publication, re-run the review — cleared status applies to the exact wording above.',
    },
    { kind: 'sign', name: 'Grace Osei', role: 'Commercial Counsel · owns marketing-claims sign-off' },
  ])
}

// ─── Legal: refund dispute recommendation ────────────────────────────────────

function disputeDoc(c: Ctx): ArtifactDoc {
  const ticket = 41000 + (c.h % 4200)
  const purchased = c.ev.ts - int(c.rng, 6, 11) * 30 * DAY
  const batch = `B2-24${(c.h % 90) + 10}`
  return doc(c, 'memo', 'MEMORANDUM', [
    {
      kind: 'fields',
      rows: [
        { k: 'Ticket', v: `#EP-${ticket}` },
        { k: 'Product', v: 'Basecamp 2 tent' },
        { k: 'Purchased', v: longDate(purchased) },
        { k: 'Claim', v: 'Pole failure during storm — refund denied under weather exclusion' },
      ],
    },
    {
      kind: 'para',
      text: 'The warranty covers manufacturing defects and excludes ordinary storm damage, so the automated denial followed policy on its face. However, the customer’s photos show the failure at the pole-sleeve junction — the same failure mode documented in batch ' +
        batch +
        ', for which we quietly replaced 14 units last season. The purchase date places this tent inside that batch window.',
    },
    {
      kind: 'para',
      text: 'Recommendation: reverse the denial and offer a replacement tent with a prepaid return label for inspection. Treat it as a defect claim, not goodwill, so the unit feeds the batch investigation. No change to the published policy is needed.',
    },
    {
      kind: 'note',
      text: 'Replacement value exceeds the $300 autonomous limit — escalated to the requesting department lead for sign-off before Support replies.',
      tone: 'human',
    },
    { kind: 'sign', name: 'Rob Alvarez', role: 'General Counsel · reviewing' },
  ])
}

// ─── Operations: restock ETA report ──────────────────────────────────────────

const PRODUCT_SKUS: Record<string, string> = {
  'Ridgeline 40L': 'EP-PK-R40',
  'Basecamp 2 tent': 'EP-TN-BC2',
  'Scree 28L': 'EP-PK-S28',
  'Cirrus down hoodie': 'EP-IN-CDH',
}

function restockDoc(c: Ctx): ArtifactDoc {
  const product = c.task?.title.match(/Stock check(?: —|:) (.+?) backorders/)?.[1] ?? 'the requested product'
  const sku = PRODUCT_SKUS[product] ?? `EP-SKU-${(c.h % 900) + 100}`
  const backorders = int(c.rng, 40, 140)
  const inbound = int(c.rng, 200, 480)
  const eta = c.ev.ts + int(c.rng, 9, 16) * DAY
  const po = `PO-EP-${3400 + (c.h % 500)}`
  const shipWeek = shortDate(nextMonday(eta))

  return doc(c, 'table', 'RESTOCK REPORT', [
    {
      kind: 'para',
      text: `Position for the ${product} (${sku}) as of last night’s Shopify ↔ warehouse reconciliation. The line is sold through at the Tacoma DC; the inbound purchase order below covers all open backorders with margin.`,
    },
    {
      kind: 'table',
      columns: ['Line', 'Units'],
      align: ['l', 'r'],
      rows: [
        ['On hand — Tacoma DC', '0'],
        ['Open backorders', String(backorders)],
        [`Inbound ${po} · ETA ${shortDate(eta)}`, String(inbound)],
      ],
      footRows: [{ cells: ['Available after receipt', String(inbound - backorders)], strong: true }],
      note: 'Cycle-count variance last audit: 0.4% · counts refreshed nightly.',
    },
    {
      kind: 'para',
      text: `Safe customer messaging: orders placed today ship the week of ${shipWeek}. Backordered units allocate in order-date sequence the day ${po} is received and QC’d.`,
    },
  ])
}

// ─── Operations: new-hire equipment order ────────────────────────────────────

const ROLE_KITS: Record<string, { text: string; done: boolean; note?: string }[]> = {
  'pack fitter': [
    { text: 'Torso-measure rig + fit stool', done: true },
    { text: 'Sample pack set — S/M/L frames', done: true },
    { text: 'Hip-belt heat molder', done: false, note: 'backordered' },
  ],
  'warehouse lead': [
    { text: 'RF scanner + charging dock', done: true },
    { text: 'Steel-toe boot stipend issued', done: true },
    { text: 'Forklift certification renewal', done: false, note: 'scheduled' },
  ],
  'gear repair tech': [
    { text: 'Repair bench kit — seam sealer, patches', done: true },
    { text: 'Bartack machine time slot reserved', done: true },
    { text: 'Down-fill scale', done: false, note: 'ships direct' },
  ],
  'showroom associate': [
    { text: 'POS login + register training slot', done: true },
    { text: 'Uniform kit — 3× staff shell', done: true },
    { text: 'Floor radio + earpiece', done: false, note: 'in transit' },
  ],
}

function equipmentDoc(c: Ctx): ArtifactDoc {
  const role = c.task?.title.match(/new hire(?: —|:) (.+)$/)?.[1] ?? 'new team member'
  const kit = ROLE_KITS[role] ?? [
    { text: 'Role equipment per the standard kit list', done: true },
    { text: 'Department tool access requested', done: true },
  ]
  const start = nextMonday(c.ev.ts)
  const total = int(c.rng, 1400, 3200)
  const pending = kit.find((i) => !i.done)

  return doc(c, 'checklist', 'ORDER CONFIRMATION', [
    {
      kind: 'fields',
      rows: [
        { k: 'New hire', v: `${role.charAt(0).toUpperCase()}${role.slice(1)} — starts Monday, ${shortDate(start)}` },
        { k: 'Ship to', v: 'Everpeak HQ · 1440 Basecamp Way, Bellingham, WA' },
        { k: 'Cost center', v: 'OPS-ONBD · approved standard kit' },
        { k: 'Kit total', v: usd(total, false) },
      ],
    },
    { kind: 'heading', text: 'Standard kit' },
    {
      kind: 'checklist',
      items: [
        { text: 'Laptop — standard build, imaged', done: true },
        { text: 'Badge + door access (warehouse & showroom)', done: true },
        { text: 'BambooHR profile provisioned by HR', done: true },
      ],
    },
    { kind: 'heading', text: `Role kit — ${role}` },
    { kind: 'checklist', items: kit },
    ...(pending
      ? [{
          kind: 'note' as const,
          text: `“${pending.text}” lands after the start date — flagged to the hiring manager so day one isn’t blocked on it.`,
          tone: 'human' as const,
        }]
      : []),
  ])
}

// ─── Finance/Ops: SKU count export ───────────────────────────────────────────

function skuExportDoc(c: Ctx): ArtifactDoc {
  const items: [string, string, number][] = [
    ['EP-PK-R40', 'Ridgeline 40L pack', 84.2],
    ['EP-PK-S28', 'Scree 28L pack', 61.4],
    ['EP-TN-BC2', 'Basecamp 2 tent', 148.75],
    ['EP-IN-CDH', 'Cirrus down hoodie', 96.1],
    ['EP-AC-TRK', 'Switchback trekking poles', 27.35],
  ]
  const rows = items.map(([sku, prod, cost]) => {
    const units = int(c.rng, 120, 1400)
    return { sku, prod, units, cost, ext: units * cost }
  })
  const gross = rows.reduce((s, r) => s + r.ext, 0)
  const reserve = gross * 0.02

  return doc(c, 'table', 'INVENTORY EXPORT', [
    {
      kind: 'para',
      text: `Unit counts by SKU for the Q3 valuation, exported from the nightly Shopify ↔ warehouse reconciliation of ${longDate(c.ev.ts)}. Unit costs are landed cost per the last received PO.`,
    },
    {
      kind: 'table',
      columns: ['SKU', 'Product', 'Units', 'Unit cost', 'Ext. value'],
      align: ['l', 'l', 'r', 'r', 'r'],
      rows: rows.map((r) => [r.sku, r.prod, r.units.toLocaleString('en-US'), usd(r.cost), usd(r.ext)]),
      footRows: [
        { cells: ['', 'Gross valuation', '', '', usd(gross)] },
        { cells: ['', 'Damage & return reserve (2%)', '', '', `−${usd(reserve)}`] },
        { cells: ['', 'Net for Q3 valuation', '', '', usd(gross - reserve)], strong: true },
      ],
      note: 'Cycle-count variance within 0.4% across all locations.',
    },
    { kind: 'para', text: 'Counts are frozen as of this export for valuation purposes; live availability continues to move in Shopify.' },
  ])
}

// ─── Finance: budget position ────────────────────────────────────────────────

const LAUNCH_BUDGET: [string, number][] = [
  ['Paid social', 31200],
  ['Creator partnerships', 16800],
  ['Launch film & stills', 12400],
  ['Retail & showroom displays', 9600],
  ['PR, events & seeding', 8800],
]

function budgetPositionDoc(c: Ctx): ArtifactDoc {
  const rows = LAUNCH_BUDGET.map(([k, committed]) => {
    const actual = Math.round((committed * between(c.rng, 0.35, 0.8)) / 100) * 100
    return [k, usd(committed, false), usd(actual, false)]
  })
  const committedTotal = LAUNCH_BUDGET.reduce((s, [, v]) => s + v, 0)
  const actualTotal = rows.reduce((s, r) => s + Number(r[2].replace(/[$,]/g, '')), 0)

  return doc(c, 'table', 'BUDGET POSITION', [
    {
      kind: 'para',
      text: `Current Q3 launch budget position, committed vs. actual, as of ${longDate(c.ev.ts)}. Actuals come straight from QuickBooks launch cost centers; commitments from the approved plan.`,
    },
    {
      kind: 'table',
      columns: ['Line item', 'Committed', 'Actual to date'],
      align: ['l', 'r', 'r'],
      rows,
      footRows: [
        { cells: ['Total', usd(committedTotal, false), usd(actualTotal, false)], strong: true },
      ],
      note: 'Envelope $85,000 · remaining headroom clears the plan.',
    },
    {
      kind: 'para',
      text: 'No overruns projected. The largest open commitment is the launch film final invoice, expected in the next two weeks.',
    },
  ])
}

// ─── Support: FAQs ───────────────────────────────────────────────────────────

const FIT_FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I measure my torso length for a pack?',
    a: 'Run a soft tape from the C7 vertebra (the bump at the base of your neck) to the point on your spine level with the top of your hip bones. That number in inches maps directly to the size chart on each pack page.',
  },
  {
    q: 'I’m between sizes — which should I choose?',
    a: 'Size down if you carry light and value agility; size up if you regularly haul 35 lb or more. The new chart lists both cutoffs, and every pack has 2 in of torso adjustment built in.',
  },
  {
    q: 'Did sizing change on existing packs?',
    a: 'No — the packs are unchanged. The new chart measures the same fit more precisely, so some people will land in a different labeled size than before. Trust the new measurements.',
  },
  {
    q: 'How should the hip belt sit?',
    a: 'The padded wings should wrap the top of your hip bones, not your waist. If the padding ends before your hip points, try the next belt size — belts swap without tools on all current packs.',
  },
  {
    q: 'Can I exchange if the fit is wrong?',
    a: 'Yes — free size exchanges within 60 days, even after trail use. Start the exchange from your order page and keep using the pack until the replacement arrives.',
  },
]

const GENERAL_FAQ: { q: string; a: string }[] = [
  {
    q: 'How long does shipping take?',
    a: 'In-stock gear leaves the Tacoma DC within one business day; ground delivery runs 2–5 days in the lower 48. You’ll get tracking the moment the label prints.',
  },
  {
    q: 'What is your return policy?',
    a: '60 days, free returns, even after trail use — we’d rather you test the gear than guess. Refunds land 3–5 days after the warehouse checks the item in.',
  },
  {
    q: 'How do I find my size?',
    a: 'Every product page links a measured size chart. If you’re between sizes, the fit notes on the page say which way that product runs — and size exchanges are always free.',
  },
  {
    q: 'How should I care for technical fabrics?',
    a: 'Cold wash, technical detergent, no fabric softener, hang or low tumble dry. Reproof shells with a wash-in DWR once water stops beading.',
  },
  {
    q: 'What does the warranty cover?',
    a: 'Manufacturing defects for the life of the product — repair or replace. Wear-and-tear damage isn’t covered, but the repair desk fixes most of it at cost.',
  },
]

function faqDoc(c: Ctx): ArtifactDoc {
  const n = c.name.toLowerCase()
  if (n.includes('fit')) {
    return doc(c, 'faq', 'FAQ DRAFT', [
      {
        kind: 'para',
        text: 'Refreshed after the new sizing chart shipped — these replace the current top five fit questions in the help center, in ranked order by ticket volume.',
      },
      { kind: 'qa', items: FIT_FAQ },
      {
        kind: 'note',
        text: 'Publishing to the help center needs Nina Park’s approval — queued in her approvals list.',
        tone: 'human',
      },
    ])
  }
  return doc(c, 'faq', 'FAQ DRAFT', [
    {
      kind: 'para',
      text: 'Customer-facing FAQ draft for the requested topic, built from current policy pages and the top recurring ticket intents.',
    },
    { kind: 'qa', items: GENERAL_FAQ },
    { kind: 'note', text: 'Staged as unpublished Zendesk articles — publish is gated on the help-center owner.', tone: 'human' },
  ])
}

// ─── Support: carrier delay notice + macros ──────────────────────────────────

function delayNoticeDoc(c: Ctx): ArtifactDoc {
  const count = 60
  const newEta = `${shortDate(c.ev.ts + 4 * DAY)}–${shortDate(c.ev.ts + 6 * DAY)}`
  return doc(c, 'macros', 'CUSTOMER NOTICE — DRAFT', [
    {
      kind: 'fields',
      rows: [
        { k: 'Audience', v: `${count} customers with shipments on the Pacific coastal route` },
        { k: 'Channel', v: 'Email · order-update template' },
        { k: 'Send window', v: `Today by 3 pm — before the carrier’s own delay notices land` },
      ],
    },
    {
      kind: 'macro',
      label: 'Proactive notice',
      subject: 'Your Everpeak order — a short weather delay',
      body:
        'Quick heads-up before the carrier tells you: Pacific storms have slowed the route your order is on. Your new delivery window is ' +
        newEta +
        ', about 4–6 days later than planned.\n\nNothing is needed from you — the order is packed and moving. If the new timing doesn’t work (a trip, a gift), reply to this email and we’ll hold it, reroute it, or sort it out.',
    },
    {
      kind: 'macro',
      label: 'Reply macro — “where is my order?”',
      body:
        'Your order is one of about 60 riding out the Pacific storm delay — it’s packed and in the carrier network, just moving slowly. Current window: ' +
        newEta +
        '. If that timing breaks something on your end, tell me and I’ll find an option.',
    },
    {
      kind: 'note',
      text: 'The forwarded carrier advisory contained embedded instructions; the local regex guardrail stripped them at the gateway before drafting began.',
      tone: 'guard',
    },
  ])
}

// ─── Fallbacks: brief + seeded generic ───────────────────────────────────────

function briefDoc(c: Ctx): ArtifactDoc {
  const audience = pick(c.rng, [
    'Core backpacking customers and waitlist signups',
    'Weekend hikers upgrading their first serious kit',
    'Returning customers replacing an older product',
  ])
  const channel = pick(c.rng, ['Email + paid social', 'Launch page + showroom', 'Email + help-center banner'])
  return doc(c, 'brief', 'BRIEF', [
    {
      kind: 'fields',
      rows: [
        { k: 'Objective', v: c.task?.objective ?? c.task?.title ?? c.name },
        { k: 'Audience', v: audience },
        { k: 'Channels', v: channel },
        { k: 'Timing', v: `Week of ${shortDate(nextMonday(c.ev.ts))}` },
      ],
    },
    {
      kind: 'para',
      text: 'Key message: lead with the tested numbers, not adjectives — ratings, materials, and the lifetime repair program. Everpeak reads best when the gear’s spec sheet does the selling.',
    },
    {
      kind: 'checklist',
      items: [
        { text: 'Hero copy drafted and routed to Legal for claims check', done: true },
        { text: 'Asset list confirmed with the brand designer', done: true },
        { text: 'Success metric agreed with the requesting desk', done: false, note: 'awaiting reply' },
      ],
    },
  ])
}

function genericDoc(c: Ctx): ArtifactDoc {
  const summary = pick(c.rng, [
    'Compiled from the systems this desk owns, cross-checked against the request scope, and packaged for handoff.',
    'Drafted from current records with sources noted inline; nothing outside the scoped brief was accessed.',
    'Assembled from the latest synced data; figures reflect the state of the system at delivery time.',
  ])
  const contents = [
    pick(c.rng, ['Summary of findings with sources', 'Current-state snapshot with sources', 'Findings, ranked by impact']),
    pick(c.rng, ['Supporting figures, dated at export', 'Line-level detail in the appendix', 'Reference data as of last sync']),
    pick(c.rng, ['Open questions for the requesting desk', 'Suggested next step and owner', 'Items needing a human decision']),
  ]
  return doc(c, 'generic', c.type.toUpperCase(), [
    {
      kind: 'para',
      text: `${c.name} — prepared in response to “${c.task?.title ?? 'the request'}”. ${c.task?.objective ?? summary}`,
    },
    {
      kind: 'fields',
      rows: [
        { k: 'Format', v: c.type },
        { k: 'Scope', v: 'Scoped brief only — request and artifact cross the department line, nothing else' },
        { k: 'Delivered to', v: c.recipientDesk },
      ],
    },
    { kind: 'heading', text: 'Contents' },
    { kind: 'checklist', items: contents.map((t) => ({ text: t, done: true })) },
    { kind: 'para', text: summary },
  ])
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export function buildArtifactDoc(
  event: WorldEvent,
  opts: { task?: Task; agents?: AgentDef[] } = {},
): ArtifactDoc {
  const c = makeCtx(event, opts.task, opts.agents ?? BASE_AGENTS)
  const n = c.name.toLowerCase()

  // Real worker output attached by the engine beats any authored template.
  const art = event.payload?.artifact
  if (art?.content && art.content.trim()) {
    const desk =
      (event.deptTo && deptById.get(event.deptTo)?.name) ??
      (opts.task && deptById.get(opts.task.originDept)?.name) ??
      c.desk
    return {
      docType: 'generic',
      label: 'Live output',
      title: c.name,
      meta: c.meta,
      blocks: art.content
        .split(/\n\s*\n/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((text): DocBlock => ({ kind: 'para', text })),
      recipientDesk: `${desk} desk`,
      live: { source: art.source ?? c.preparedBy },
    }
  }

  if (art?.template) return templateDoc(c, art.template)

  if (n.includes('payment confirmation')) return paymentDoc(c)
  if (n.includes('claims review') || n.includes('compliance review')) return claimsNoteDoc(c)
  if (n.includes('dispute recommendation')) return disputeDoc(c)
  if (n.includes('restock')) return restockDoc(c)
  if (n.includes('equipment order')) return equipmentDoc(c)
  if (n.includes('sku count')) return skuExportDoc(c)
  if (n.includes('budget position')) return budgetPositionDoc(c)
  if (n.includes('faq')) return faqDoc(c)
  if (n.includes('delay notice')) return delayNoticeDoc(c)
  if (/brief|campaign|one-?pager|launch plan/.test(n)) return briefDoc(c)
  return genericDoc(c)
}
