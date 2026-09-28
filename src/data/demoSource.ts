/**
 * Sample data in memory, for `npm run dev:demo` — to look at the screens without a Power Apps host.
 * Same contract and same journey rules as `dataverseSource`. Nothing is saved: a reload resets it.
 *
 * Six months of history is GENERATED (with a fixed seed, so it is the same every time) so the
 * dashboard has something to show. The channels behave differently on purpose — netwerk answers
 * most, mail least — so the channel comparison has a story. That story is invented; real numbers
 * come from Dataverse.
 */

import type { DataSource } from './DataSource'
import type { ContactChannel, Customer, JourneyEvent, JourneyStep, Lead, Note, Proposal, Prospect } from './types'
import { evaluate, isGoodProspect, validationNote } from './criteria'
import { NOTE, kindOf } from './journeyNotes'

interface DemoAccount extends Omit<Prospect, 'step'> {
  type: 'prospect' | 'klant'
  active: boolean
  since?: string
}

const DAY = 86_400_000
const NOW = Date.now()
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()
let seq = 100
const newId = () => `demo-${++seq}`

/** mulberry32: a tiny seeded random generator, so the demo is the same on every reload. */
function seeded(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = seeded(365)
const between = (a: number, b: number) => a + rnd() * (b - a)
const pick = <T,>(items: [T, number][]): T => {
  let r = rnd()
  for (const [v, w] of items) if ((r -= w) <= 0) return v
  return items[items.length - 1][0]
}

const accounts: DemoAccount[] = []
const leads: Lead[] = []
const proposals: Proposal[] = []
const notes = new Map<string, Note[]>()

function addNote(id: string, subject: string, text?: string, on = new Date().toISOString()) {
  notes.set(id, [{ id: newId(), subject, text: text?.trim() || undefined, createdOn: on }, ...(notes.get(id) ?? [])])
}

/* ---------- The generated history ---------- */

const NAMES = [
  'Vandecasteele Staal', 'Flanders Packaging', 'Maes Kunststoffen', 'Peeters Industrie', 'Brouwerij Het Anker',
  'De Smet Machinebouw', 'Lambrecht Houtbewerking', 'Verhaeghe Coatings', 'Nuyts Elektro', 'Goossens Verpakking',
  'Claeys Metaalwerken', 'Wouters Drukkerij', 'Jacobs Tuinbouw', 'Mertens Meubelmakerij', 'Dubois Chemie',
  'Hermans Textiel', 'Pauwels Glas', 'Willems Precisie', 'Aerts Voeding', 'Desmet Recycling',
  'Van Damme Kozijnen', 'Coppens Hydrauliek', 'Stevens Automotive', 'Martens Laswerken', 'Declercq Isolatie',
  'Michiels Kunststof', 'Leroy Bakery Equipment', 'Hendrickx Bouwmaterialen', 'Vermeulen Pompen', 'Segers Lasertechniek',
  'Timmermans Zeefdruk', 'Baert Koeltechniek', 'Cools Verlichting', 'Wuyts Robotics', 'De Backer Gieterij',
  'Lemmens Etiketten', 'Bogaert Aluminium', 'Van Acker Ventilatie', 'Moens Keramiek', 'Rombouts Kartonnage',
  'Smets Precisiemechaniek', 'Verbruggen Borstels', 'Dewulf Landbouwmachines', 'Pieters Zonwering',
]
const CITIES = ['Gent', 'Kortrijk', 'Roeselare', 'Aalst', 'Antwerpen', 'Mechelen', 'Brugge', 'Hasselt', 'Leuven', 'Genk']
const FIRST = ['Sofie', 'Tom', 'Lien', 'Pieter', 'An', 'Jens', 'Eline', 'Bart', 'Nina', 'Wim']

/** How each channel behaves in the demo: chance of a reply, of a meeting, of a yes. */
const CHANNEL: Record<ContactChannel, { weight: number; reply: number; meeting: number; win: number }> = {
  telefoon: { weight: 0.45, reply: 0.55, meeting: 0.6, win: 0.5 },
  mail: { weight: 0.35, reply: 0.3, meeting: 0.5, win: 0.45 },
  netwerk: { weight: 0.2, reply: 0.8, meeting: 0.75, win: 0.65 },
}
const channels = Object.entries(CHANNEL).map(([c, v]) => [c as ContactChannel, v.weight] as [ContactChannel, number])

// Two rounds over the names (the second with a city) give ~90 leads over six months.
const ALL = [...NAMES, ...NAMES.map((n, i) => `${n} ${CITIES[(i + 3) % CITIES.length]}`)]

ALL.forEach((name, i) => {
  const accountId = `a${i}`
  const employees = Math.round(between(12, 220))
  const revenue = Math.round(between(1.2, 25)) * 1_000_000
  const validatedAgo = between(2, 182) * DAY
  accounts.push({ id: accountId, name, employees, revenue, city: CITIES[i % CITIES.length], type: 'prospect', active: true, createdOn: at(validatedAgo + 2 * DAY) })

  const lead: Lead = {
    id: `l${i}`, subject: name, companyName: name, accountId, firstName: FIRST[i % FIRST.length], lastName: name.split(' ')[0],
    email: `info@${name.split(' ')[0].toLowerCase()}.be`, temperature: 'koud', state: 'open', contacted: false, createdOn: at(validatedAgo),
  }
  leads.push(lead)
  addNote(lead.id, NOTE.validated, 'Heeft genoeg geld, Meer dan 10 werknemers.', at(validatedAgo))

  // Everything that follows stops at "now": a recent lead is simply earlier in its journey.
  let t = validatedAgo - between(1, 4) * DAY
  if (t <= 0) return
  let channel = pick(channels)
  addNote(lead.id, NOTE.contact(channel), undefined, at(t))
  lead.contacted = true
  let replied = rnd() < CHANNEL[channel].reply
  if (!replied && rnd() < 0.5) {
    // No answer: a second try, through another channel.
    t -= between(7, 11) * DAY
    if (t <= 0) return
    channel = pick(channels.filter(([c]) => c !== channel))
    addNote(lead.id, NOTE.contact(channel), 'Tweede poging', at(t))
    replied = rnd() < CHANNEL[channel].reply
  }
  if (!replied) {
    // Long silent leads were closed by hand at some point, as a salesperson would in Sales Hub.
    if (t > 45 * DAY) lead.state = 'gestopt'
    return
  }

  t -= between(2, 8) * DAY
  if (t <= 0) return
  if (rnd() > CHANNEL[channel].meeting) {
    addNote(lead.id, NOTE.meetingNo, 'Geen interesse op dit moment.', at(t))
    lead.state = 'gestopt'
    return
  }
  addNote(lead.id, NOTE.meetingYes, undefined, at(t))
  lead.temperature = 'warm'

  t -= between(5, 15) * DAY
  if (t <= 0 || rnd() > 0.85) return
  const value = Math.round(between(8, 60)) * 1000
  const proposal: Proposal = {
    id: `o${i}`, name: `Voorstelling ${name}`, accountId, accountName: name, leadId: lead.id,
    estimatedValue: value, state: 'open', createdOn: at(t),
  }
  proposals.push(proposal)
  addNote(proposal.id, NOTE.proposal, undefined, at(t))
  lead.state = 'gekwalificeerd'

  t -= between(7, 25) * DAY
  // Some recent voorstellingen are still waiting for an answer.
  if (t <= 0 || (t < 30 * DAY && rnd() < 0.5)) return
  const agreed = rnd() < CHANNEL[channel].win
  addNote(proposal.id, agreed ? NOTE.agreed : NOTE.refused, undefined, at(t))
  proposal.state = agreed ? 'akkoord' : 'geweigerd'
  proposal.closedOn = at(t)
  if (agreed) {
    const a = accounts[accounts.length - 1]
    a.type = 'klant'
    a.since = at(t)
  }
})

// A few fresh prospects waiting for analysis, and one that did not fit.
accounts.unshift(
  { id: 'n1', name: 'Vandelanotte Metaalbouw', employees: 45, revenue: 6_200_000, city: 'Roeselare', type: 'prospect', active: true, createdOn: at(2 * DAY) },
  { id: 'n2', name: 'Bakkerij De Gouden Aar', employees: 6, revenue: 400_000, city: 'Gent', type: 'prospect', active: true, createdOn: at(3 * DAY) },
  { id: 'n3', name: 'Atelier Noord', employees: 8, revenue: 1_500_000, city: 'Brugge', type: 'prospect', active: true, createdOn: at(1 * DAY) },
  { id: 'n4', name: 'Kapsalon Zuid', employees: 3, revenue: 150_000, city: 'Leuven', type: 'prospect', active: false, createdOn: at(20 * DAY) },
)
leads.sort((a, b) => b.createdOn.localeCompare(a.createdOn))
proposals.sort((a, b) => b.createdOn.localeCompare(a.createdOn))

/* ---------- The contract ---------- */

function stepOf(a: DemoAccount): JourneyStep {
  if (!a.active) return 'niet-geschikt'
  if (a.type === 'klant') return 'klant'
  const ps = proposals.filter((p) => p.accountId === a.id)
  if (ps.some((p) => p.state === 'open')) return 'voorstelling'
  const lead = leads.find((l) => l.accountId === a.id)
  if (lead?.state === 'open') return lead.temperature === 'koud' ? 'koude-lead' : 'warme-lead'
  if (lead || ps.length) return 'gestopt'
  return 'te-analyseren'
}

const toProspect = (a: DemoAccount): Prospect => ({ ...a, step: stepOf(a) })
const wait = () => new Promise((r) => setTimeout(r, 120))

function openLead(id: string): Lead {
  const lead = leads.find((l) => l.id === id)
  if (!lead) throw new Error('Deze lead bestaat niet meer.')
  if (lead.state !== 'open') throw new Error('Deze lead is al afgesloten.')
  return lead
}

export const demoSource: DataSource = {
  name: 'Demo',

  async getCounts() {
    await wait()
    const prospects = accounts.filter((a) => a.type === 'prospect').map(toProspect)
    const open = leads.filter((l) => l.state === 'open')
    return {
      prospects: prospects.filter((p) => p.step === 'te-analyseren').length,
      coldLeads: open.filter((l) => l.temperature === 'koud').length,
      warmLeads: open.filter((l) => l.temperature === 'warm').length,
      proposals: proposals.filter((p) => p.state === 'open').length,
      customers: accounts.filter((a) => a.type === 'klant' && a.active).length,
    }
  },

  async getProspects() {
    await wait()
    return accounts.filter((a) => a.type === 'prospect').map(toProspect)
  },

  async createProspect(input) {
    await wait()
    if (!input.name.trim()) throw new Error('Geef de naam van het bedrijf.')
    const id = newId()
    accounts.unshift({ ...input, name: input.name.trim(), id, type: 'prospect', active: true, createdOn: new Date().toISOString() })
    return id
  },

  async updateProspect(id, change) {
    await wait()
    const a = accounts.find((x) => x.id === id)
    if (a) Object.assign(a, change)
  },

  async validateProspect({ prospectId, makesProducts, contact }) {
    await wait()
    const a = accounts.find((x) => x.id === prospectId)
    if (!a) throw new Error('Dit bedrijf bestaat niet meer.')
    const criteria = evaluate(a, makesProducts)
    if (!isGoodProspect(criteria)) {
      throw new Error('De analyse is niet in orde: genoeg geld is verplicht, en minstens 2 van de 3 criteria moeten kloppen.')
    }
    const id = newId()
    leads.unshift({
      id, subject: a.name, companyName: a.name, accountId: a.id, ...contact,
      temperature: 'koud', state: 'open', contacted: false, createdOn: new Date().toISOString(),
    })
    addNote(id, NOTE.validated, validationNote(criteria))
    return id
  },

  async rejectProspect(id) {
    await wait()
    const a = accounts.find((x) => x.id === id)
    if (a) a.active = false
  },

  async getLeads() {
    await wait()
    return [...leads]
  },

  async getNotes(_kind, id) {
    await wait()
    return notes.get(id) ?? []
  },

  async logContact(leadId, channel, note) {
    await wait()
    const lead = openLead(leadId)
    addNote(leadId, NOTE.contact(channel), note)
    lead.contacted = true
  },

  async recordMeeting(leadId, agreed, note) {
    await wait()
    const lead = openLead(leadId)
    addNote(leadId, agreed ? NOTE.meetingYes : NOTE.meetingNo, note)
    if (agreed) lead.temperature = 'warm'
    else lead.state = 'gestopt'
  },

  async startProposal({ leadId, name, estimatedValue, description }) {
    await wait()
    const lead = openLead(leadId)
    if (lead.temperature !== 'warm') throw new Error('Eerst een afspraak: alleen een warme lead krijgt een voorstelling.')
    const id = newId()
    const account = accounts.find((a) => a.id === lead.accountId)
    proposals.unshift({
      id, name: name.trim() || `Voorstelling ${lead.companyName ?? lead.subject}`,
      accountId: lead.accountId, accountName: account?.name ?? lead.companyName, leadId,
      estimatedValue, description, state: 'open', createdOn: new Date().toISOString(),
    })
    addNote(id, NOTE.proposal)
    lead.state = 'gekwalificeerd'
    return id
  },

  async getProposals() {
    await wait()
    return [...proposals]
  },

  async decideProposal(id, agreed, note) {
    await wait()
    const p = proposals.find((x) => x.id === id)
    if (!p) throw new Error('Deze voorstelling bestaat niet meer.')
    if (p.state !== 'open') throw new Error('Over deze voorstelling is al beslist.')
    addNote(id, agreed ? NOTE.agreed : NOTE.refused, note)
    p.state = agreed ? 'akkoord' : 'geweigerd'
    p.closedOn = new Date().toISOString()
    const a = accounts.find((x) => x.id === p.accountId)
    if (agreed && a) {
      a.type = 'klant'
      a.since = p.closedOn
    }
  },

  async getCustomers() {
    await wait()
    return accounts
      .filter((a) => a.type === 'klant' && a.active)
      .map((a): Customer => ({ id: a.id, name: a.name, city: a.city, phone: a.phone, email: a.email, phase: 'fase-0', since: a.since }))
  },

  async getDashboardData() {
    await wait()
    const byProposal = new Map(proposals.map((p) => [p.id, p]))
    const byLead = new Map(leads.map((l) => [l.id, l]))
    const events: JourneyEvent[] = []
    for (const [objectId, list] of notes) {
      const proposal = byProposal.get(objectId)
      const leadId = proposal ? proposal.leadId : objectId
      if (!leadId) continue
      for (const n of list) {
        const meaning = kindOf(n.subject)
        if (!meaning) continue
        events.push({
          ...meaning,
          on: n.createdOn,
          leadId,
          company: byLead.get(leadId)?.companyName ?? proposal?.accountName,
          value: proposal?.estimatedValue,
        })
      }
    }
    events.sort((a, b) => a.on.localeCompare(b.on))
    return {
      events,
      openLeads: leads.filter((l) => l.state === 'open'),
      openProposals: proposals.filter((p) => p.state === 'open'),
    }
  },
}
