export type DocType = 'memo' | 'table' | 'faq' | 'brief' | 'checklist' | 'macros' | 'generic'

export interface ClaimItem {
  claim: string
  verdict: 'cleared' | 'redlined'
  /** Suggested replacement wording for a redlined claim. */
  replacement?: string
  /** One-line margin rationale. */
  note: string
}

export type DocBlock =
  | { kind: 'para'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'fields'; rows: { k: string; v: string }[] }
  | {
      kind: 'table'
      columns: string[]
      /** Per-column alignment; right-aligned columns render tabular numerals. */
      align: ('l' | 'r')[]
      rows: string[][]
      footRows?: { cells: string[]; strong?: boolean }[]
      note?: string
    }
  | { kind: 'qa'; items: { q: string; a: string }[] }
  | { kind: 'claims'; items: ClaimItem[] }
  | { kind: 'checklist'; items: { text: string; done: boolean; note?: string }[] }
  | { kind: 'macro'; label: string; subject?: string; body: string }
  | { kind: 'note'; text: string; tone?: 'human' | 'guard' }
  | { kind: 'sign'; name: string; role: string }

/** Content supplied by a rehearsal or another artifact producer. */
export interface ArtifactTemplate {
  docType: DocType
  label: string
  title?: string
  blocks: DocBlock[]
}

/** A template combined with event-derived provenance for display. */
export interface ArtifactDoc {
  docType: DocType
  /** Letterhead label, for example "MEMORANDUM". */
  label: string
  title: string
  /** Task, date, and author metadata derived from the event. */
  meta: string[]
  blocks: DocBlock[]
  /** Destination desk derived from the event or owning task. */
  recipientDesk: string
  /** Present only when the document came from live worker output. */
  live?: { source: string }
}
