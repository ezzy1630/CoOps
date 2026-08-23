import type { ArtifactTemplate } from '../../artifacts/document.js'

export const SUMMIT_CLAIMS_REVIEW_TEMPLATE = {
  docType: 'memo',
  label: 'MEMORANDUM',
  blocks: [
    {
      kind: 'para',
      text: 'Per the Summit Series launch brief, Legal reviewed the four hero claims scheduled for the launch page, paid social, and packaging inserts. Three clear as written; one is redlined with suggested replacement wording below.',
    },
    {
      kind: 'claims',
      items: [
        {
          claim: 'Warmest jacket we’ve ever made',
          verdict: 'redlined',
          replacement: 'Our warmest Summit-line jacket to date — 850-fill down, tested to a −30 °F comfort limit',
          note: 'Bare superlative reads as a market-wide comparison. Scope it to our own line and cite the test basis.',
        },
        {
          claim: '850-fill responsibly sourced down',
          verdict: 'cleared',
          note: 'RDS certificate #RDS-2214 current through 2027.',
        },
        {
          claim: 'Waterproof 3-layer shell',
          verdict: 'cleared',
          note: '20,000 mm hydrostatic head — lab report EP-L-0326, March 2026.',
        },
        {
          claim: 'Guaranteed for life',
          verdict: 'cleared',
          note: 'Permitted with the standard link to warranty terms (repair-or-replace program).',
        },
      ],
    },
    {
      kind: 'para',
      text: 'With the single qualifier applied, the claim set is cleared for external use across all launch surfaces. Sign-off logged to the claims register via DocuSign.',
    },
    { kind: 'sign', name: 'Rob Alvarez', role: 'General Counsel · claims sign-off' },
  ],
} satisfies ArtifactTemplate

export const SUMMIT_BUDGET_CONFIRMATION_TEMPLATE = {
  docType: 'table',
  label: 'BUDGET CONFIRMATION',
  blocks: [
    {
      kind: 'para',
      text: 'The Summit Series launch envelope is confirmed at $85,000 against Q3 actuals, pulled read-only from QuickBooks launch cost centers. Committed lines are below; spend to date tracks 4% under plan with no lines at risk.',
    },
    {
      kind: 'table',
      columns: ['Line item', 'Committed'],
      align: ['l', 'r'],
      rows: [
        ['Paid social', '$31,200'],
        ['Creator partnerships', '$16,800'],
        ['Launch film & stills', '$12,400'],
        ['Retail & showroom displays', '$9,600'],
        ['PR, events & seeding', '$8,800'],
      ],
      footRows: [
        { cells: ['Committed subtotal', '$78,800'] },
        { cells: ['Contingency remaining', '$6,200'] },
        { cells: ['Approved envelope', '$85,000'], strong: true },
      ],
      note: 'Source: QuickBooks Q3 actuals · scoped capability grant, read-only.',
    },
    {
      kind: 'para',
      text: 'Contingency stays unallocated until launch week; draws above $2,000 need Finance sign-off under the launch agent’s limits.',
    },
    { kind: 'sign', name: 'Dana Whitfield', role: 'Finance Operations Lead · envelope owner' },
  ],
} satisfies ArtifactTemplate

export const SUMMIT_FAQ_TEMPLATE = {
  docType: 'faq',
  label: 'FAQ DRAFT',
  blocks: [
    {
      kind: 'para',
      text: 'Launch-day FAQ set for the Summit Series, drafted from the product spec sheet. Six of twelve are shown here in ranked order; the full set is staged in Zendesk as unpublished articles.',
    },
    {
      kind: 'qa',
      items: [
        {
          q: 'How warm is the Summit Series jacket?',
          a: 'It carries a −30 °F comfort-limit rating from EN-standard lab testing with 850-fill down. Real-world warmth varies with layering and wind, so treat the rating as a lab benchmark, not a promise for every condition.',
        },
        {
          q: 'Is it actually waterproof, or just water-resistant?',
          a: 'Waterproof: a 3-layer shell rated to 20,000 mm hydrostatic head with fully taped seams. Sustained heavy rain is fine; the down is also treated to resist moisture if the shell is compromised.',
        },
        {
          q: 'How does Summit Series sizing run?',
          a: 'True to size with an alpine cut — room for a midlayer, trim through the waist. If you’ll layer a thick fleece underneath, go one size up. The size chart lists chest, sleeve, and hem measurements per size.',
        },
        {
          q: 'How do I wash a down jacket?',
          a: 'Front-loading machine, cold, down-specific soap, then tumble dry low with clean tennis balls until fully lofted. Never dry-clean. (Two care details are still with the product team — see the note below.)',
        },
        {
          q: 'What does “guaranteed for life” cover?',
          a: 'Manufacturing defects for the life of the garment: we repair or replace, our call. Normal wear, crampon tears, and campfire embers aren’t defects — but our repair desk fixes those at cost.',
        },
        {
          q: 'When can I buy it?',
          a: 'Launch day, online and in the Bellingham showroom. Sign up on the product page for the stock alert; showroom quantities are limited in the first week.',
        },
      ],
    },
    {
      kind: 'note',
      text: 'Two open questions on care instructions (down-wash frequency, storage loft) are flagged to the product team before publish.',
      tone: 'human',
    },
  ],
} satisfies ArtifactTemplate
