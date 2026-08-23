type Presence = { refs: number; since: number }

export class PresenceRegistry {
  private people = new Map<string, Presence>()

  connect(personId: string): void {
    const p = this.people.get(personId)
    if (p) p.refs++
    else this.people.set(personId, { refs: 1, since: Date.now() })
  }

  disconnect(personId: string): void {
    const p = this.people.get(personId)
    if (!p) return
    if (--p.refs === 0) this.people.delete(personId)
  }

  list(): { people: { personId: string; since: number }[] } {
    return { people: [...this.people].map(([personId, p]) => ({ personId, since: p.since })) }
  }
}
