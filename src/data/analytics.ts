/**
 * Everything the dashboard shows, computed from journey events. Pure functions: no Dataverse,
 * no React — so the numbers can be checked on their own, and both sources give the same answers.
 *
 * Two ways of counting, on purpose, and the screen says which is which:
 *   ACTIVITY  what happened IN the period (e.g. 12 contacts were made in September)
 *   COHORT    what became of the leads that STARTED in the period (of the 20 leads first
 *             contacted in September, 9 replied). Rates are always cohort rates: an activity
 *             ratio mixes leads from different months and can exceed 100%.
 */

import type { ContactChannel, DashboardData, JourneyEvent, JourneyEventKind } from './types'
import { CHANNEL_LABELS } from './types'

const DAY = 86_400_000

/* ---------- Periods ---------- */

export type PeriodId = 'deze-maand' | 'vorige-maand' | '30d' | '90d' | 'dit-jaar'

export const PERIODS: [PeriodId, string][] = [
  ['deze-maand', 'Deze maand'],
  ['vorige-maand', 'Vorige maand'],
  ['30d', 'Laatste 30 dagen'],
  ['90d', 'Laatste 90 dagen'],
  ['dit-jaar', 'Dit jaar'],
]

export interface Range {
  from: number
  to: number
  /** The period just before, of the same length — for the deltas. */
  prevFrom: number
  prevTo: number
  prevLabel: string
}

export function rangeOf(p: PeriodId, now = new Date()): Range {
  const y = now.getFullYear()
  const m = now.getMonth()
  const t = now.getTime()
  switch (p) {
    case 'deze-maand': {
      const from = new Date(y, m, 1).getTime()
      return { from, to: t, prevFrom: new Date(y, m - 1, 1).getTime(), prevTo: from, prevLabel: 'vorige maand' }
    }
    case 'vorige-maand': {
      const from = new Date(y, m - 1, 1).getTime()
      const to = new Date(y, m, 1).getTime()
      return { from, to, prevFrom: new Date(y, m - 2, 1).getTime(), prevTo: from, prevLabel: 'de maand ervoor' }
    }
    case '30d':
      return { from: t - 30 * DAY, to: t, prevFrom: t - 60 * DAY, prevTo: t - 30 * DAY, prevLabel: 'de 30 dagen ervoor' }
    case '90d':
      return { from: t - 90 * DAY, to: t, prevFrom: t - 180 * DAY, prevTo: t - 90 * DAY, prevLabel: 'de 90 dagen ervoor' }
    case 'dit-jaar': {
      const from = new Date(y, 0, 1).getTime()
      return { from, to: t, prevFrom: new Date(y - 1, 0, 1).getTime(), prevTo: new Date(y - 1, m, now.getDate()).getTime(), prevLabel: 'vorig jaar, zelfde periode' }
    }
  }
}

/* ---------- Per-lead timeline ---------- */

interface LeadTimeline {
  leadId: string
  company?: string
  firstOf: Partial<Record<JourneyEventKind, number>>
  lastOf: Partial<Record<JourneyEventKind, number>>
  /** The channel of the FIRST contact: that is the channel that gets the credit. */
  firstChannel?: ContactChannel
  lastChannel?: ContactChannel
  contacts: number
  value?: number
}

function timelines(events: JourneyEvent[]): Map<string, LeadTimeline> {
  const m = new Map<string, LeadTimeline>()
  const sorted = [...events].sort((a, b) => a.on.localeCompare(b.on))
  for (const e of sorted) {
    const t = Date.parse(e.on)
    const tl = m.get(e.leadId) ?? { leadId: e.leadId, company: e.company, firstOf: {}, lastOf: {}, contacts: 0 }
    tl.company ??= e.company
    tl.firstOf[e.kind] ??= t
    tl.lastOf[e.kind] = t
    if (e.kind === 'contact') {
      tl.contacts++
      tl.firstChannel ??= e.channel
      tl.lastChannel = e.channel
    }
    if (e.value != null) tl.value = e.value
    m.set(e.leadId, tl)
  }
  return m
}

const inRange = (t: number | undefined, from: number, to: number) => t != null && t >= from && t < to
const replied = (tl: LeadTimeline) => tl.firstOf['afspraak-ja'] != null || tl.firstOf['afspraak-nee'] != null
const pct = (part: number, whole: number) => (whole ? part / whole : undefined)

/* ---------- The dashboard ---------- */

export interface Kpi {
  key: string
  label: string
  value: number
  format: 'count' | 'percent' | 'money' | 'days'
  previous?: number
  /** Is a higher number good? Decides the colour of the delta. */
  upIsGood: boolean
  hint: string
}

export interface FunnelStep {
  label: string
  count: number
  /** Share of the step before. */
  fromPrevious?: number
}

export interface ChannelRow {
  channel: ContactChannel
  label: string
  contacted: number
  replyRate?: number
  meetingRate?: number
  customerRate?: number
  customers: number
}

export interface Bucket {
  label: string
  value: number
  /** For the tooltip: what exactly this bucket covers. */
  detail: string
}

export type FollowUpKind = 'niet-gecontacteerd' | 'geen-reactie' | 'geen-voorstelling' | 'voorstelling-loopt'

export interface FollowUp {
  kind: FollowUpKind
  leadId?: string
  proposalId?: string
  company: string
  days: number
  advice: string
}

export interface Insight {
  tone: 'good' | 'attention' | 'neutral'
  text: string
}

export interface Dashboard {
  kpis: Kpi[]
  funnel: FunnelStep[]
  channels: ChannelRow[]
  bestChannel?: ContactChannel
  contactsPerWeek: Bucket[]
  customersPerMonth: Bucket[]
  followUps: FollowUp[]
  insights: Insight[]
  /** True when there is too little in the period to draw conclusions from. */
  thin: boolean
}

/** Channels with fewer contacted leads than this are not ranked: too little to say anything. */
export const MIN_FOR_RANKING = 3

const weekFmt = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short' })
const monthFmt = new Intl.DateTimeFormat('nl-BE', { month: 'short' })
const monthLong = new Intl.DateTimeFormat('nl-BE', { month: 'long', year: 'numeric' })

export function computeDashboard(data: DashboardData, period: PeriodId, now = new Date()): Dashboard {
  const r = rangeOf(period, now)
  const nowT = now.getTime()
  const tls = [...timelines(data.events).values()]
  const ev = data.events.map((e) => ({ ...e, t: Date.parse(e.on) }))
  const count = (kind: JourneyEventKind, from: number, to: number) => ev.filter((e) => e.kind === kind && inRange(e.t, from, to)).length
  const uniqueLeads = (kinds: JourneyEventKind[], from: number, to: number) =>
    new Set(ev.filter((e) => kinds.includes(e.kind) && inRange(e.t, from, to)).map((e) => e.leadId)).size
  const wonValue = (from: number, to: number) =>
    ev.filter((e) => e.kind === 'akkoord' && inRange(e.t, from, to)).reduce((s, e) => s + (e.value ?? 0), 0)

  /** Of the leads first contacted in [from, to): the share that replied (at any time since). */
  const replyRate = (from: number, to: number) => {
    const cohort = tls.filter((tl) => inRange(tl.firstOf.contact, from, to))
    return pct(cohort.filter(replied).length, cohort.length)
  }
  const winRate = (from: number, to: number) => {
    const won = count('akkoord', from, to)
    return pct(won, won + count('geweigerd', from, to))
  }
  /** Days from validation to akkoord, for the leads that became klant in the period. */
  const leadTime = (from: number, to: number) => {
    const won = tls.filter((tl) => inRange(tl.firstOf.akkoord, from, to) && tl.firstOf.gevalideerd != null)
    if (!won.length) return undefined
    return won.reduce((s, tl) => s + (tl.firstOf.akkoord! - tl.firstOf.gevalideerd!) / DAY, 0) / won.length
  }

  const kpis: Kpi[] = [
    { key: 'klanten', label: 'Nieuwe klanten', value: count('akkoord', r.from, r.to), previous: count('akkoord', r.prevFrom, r.prevTo), format: 'count', upIsGood: true, hint: 'Voorstellingen met akkoord in deze periode' },
    { key: 'gecontacteerd', label: 'Gecontacteerd', value: uniqueLeads(['contact'], r.from, r.to), previous: uniqueLeads(['contact'], r.prevFrom, r.prevTo), format: 'count', upIsGood: true, hint: 'Leads die we in deze periode contacteerden' },
    { key: 'gereageerd', label: 'Gereageerd', value: uniqueLeads(['afspraak-ja', 'afspraak-nee'], r.from, r.to), previous: uniqueLeads(['afspraak-ja', 'afspraak-nee'], r.prevFrom, r.prevTo), format: 'count', upIsGood: true, hint: 'Leads die antwoordden: ja of nee op een afspraak' },
    { key: 'respons', label: 'Responsgraad', value: replyRate(r.from, r.to) ?? NaN, previous: replyRate(r.prevFrom, r.prevTo), format: 'percent', upIsGood: true, hint: 'Van de leads die we voor het eerst contacteerden in deze periode, het deel dat reageerde' },
    { key: 'afspraken', label: 'Afspraken', value: count('afspraak-ja', r.from, r.to), previous: count('afspraak-ja', r.prevFrom, r.prevTo), format: 'count', upIsGood: true, hint: 'Nieuwe warme leads in deze periode' },
    { key: 'winrate', label: 'Akkoord op voorstelling', value: winRate(r.from, r.to) ?? NaN, previous: winRate(r.prevFrom, r.prevTo), format: 'percent', upIsGood: true, hint: 'Van de voorstellingen beslist in deze periode, het deel met akkoord' },
    { key: 'waarde', label: 'Gewonnen waarde', value: wonValue(r.from, r.to), previous: wonValue(r.prevFrom, r.prevTo), format: 'money', upIsGood: true, hint: 'Som van de geschatte waarde van de voorstellingen met akkoord' },
    { key: 'doorlooptijd', label: 'Doorlooptijd', value: leadTime(r.from, r.to) ?? NaN, previous: leadTime(r.prevFrom, r.prevTo), format: 'days', upIsGood: false, hint: 'Gemiddeld aantal dagen van valideren tot akkoord, voor de nieuwe klanten' },
  ]

  // Funnel — COHORT: the leads validated in the period, and how far each got so far.
  const cohort = tls.filter((tl) => inRange(tl.firstOf.gevalideerd, r.from, r.to))
  const reached = (k: JourneyEventKind) => cohort.filter((tl) => tl.firstOf[k] != null).length
  const stepCounts: [string, number][] = [
    ['Gevalideerd', cohort.length],
    ['Gecontacteerd', reached('contact')],
    ['Gereageerd', cohort.filter(replied).length],
    ['Afspraak', reached('afspraak-ja')],
    ['Voorstelling', reached('voorstelling')],
    ['Klant', reached('akkoord')],
  ]
  const funnel: FunnelStep[] = stepCounts.map(([label, n], i) => ({
    label,
    count: n,
    fromPrevious: i === 0 ? undefined : pct(n, stepCounts[i - 1][1]),
  }))

  // Channels — COHORT: leads whose FIRST contact fell in the period, credited to that channel.
  const channels: ChannelRow[] = (Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((c) => {
    const group = tls.filter((tl) => tl.firstChannel === c && inRange(tl.firstOf.contact, r.from, r.to))
    const customers = group.filter((tl) => tl.firstOf.akkoord != null).length
    return {
      channel: c,
      label: CHANNEL_LABELS[c],
      contacted: group.length,
      replyRate: pct(group.filter(replied).length, group.length),
      meetingRate: pct(group.filter((tl) => tl.firstOf['afspraak-ja'] != null).length, group.length),
      customerRate: pct(customers, group.length),
      customers,
    }
  })
  const rankable = channels.filter((c) => c.contacted >= MIN_FOR_RANKING)
  // Rank on klanten when there are enough of them to compare; otherwise on afspraken, which come
  // weeks earlier and so are measurable sooner.
  const byCustomers = rankable.reduce((s, c) => s + c.customers, 0) >= MIN_FOR_RANKING
  const rankBy: 'customerRate' | 'meetingRate' = byCustomers ? 'customerRate' : 'meetingRate'
  const ranked = [...rankable].sort((a, b) => (b[rankBy] ?? 0) - (a[rankBy] ?? 0))
  const bestChannel = ranked.length > 1 && (ranked[0][rankBy] ?? 0) > (ranked[1][rankBy] ?? 0) ? ranked[0].channel : undefined

  // Trends — ACTIVITY, independent of the period filter so the shape stays comparable.
  const contactsPerWeek: Bucket[] = []
  const monday = new Date(now)
  monday.setHours(0, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  for (let i = 11; i >= 0; i--) {
    const from = monday.getTime() - i * 7 * DAY
    const to = from + 7 * DAY
    const n = count('contact', from, to)
    contactsPerWeek.push({ label: weekFmt.format(from), value: n, detail: `Week van ${weekFmt.format(from)}: ${n} contact${n === 1 ? '' : 'en'}` })
  }
  const customersPerMonth: Bucket[] = []
  for (let i = 5; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime()
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime()
    const n = count('akkoord', from, to)
    customersPerMonth.push({ label: monthFmt.format(from), value: n, detail: `${monthLong.format(from)}: ${n} nieuwe klant${n === 1 ? '' : 'en'}` })
  }

  // Follow-up — the CURRENT state: who is waiting for us.
  const tlOf = new Map(tls.map((tl) => [tl.leadId, tl]))
  const daysSince = (t?: number) => (t == null ? 0 : Math.floor((nowT - t) / DAY))
  const followUps: FollowUp[] = []
  for (const l of data.openLeads) {
    const tl = tlOf.get(l.id)
    const company = l.companyName || l.subject
    if (l.temperature === 'koud' && !l.contacted) {
      const d = daysSince(tl?.firstOf.gevalideerd ?? Date.parse(l.createdOn))
      if (d >= 3) followUps.push({ kind: 'niet-gecontacteerd', leadId: l.id, company, days: d, advice: 'Nog niet gecontacteerd' })
    } else if (l.temperature === 'koud' && tl && !replied(tl)) {
      const d = daysSince(tl.lastOf.contact)
      const other = otherChannelAdvice(tl.lastChannel, bestChannel)
      if (d >= 7) followUps.push({ kind: 'geen-reactie', leadId: l.id, company, days: d, advice: `Geen reactie. ${other}` })
    } else if (l.temperature === 'warm' && tl) {
      const d = daysSince(tl.lastOf['afspraak-ja'])
      if (d >= 14) followUps.push({ kind: 'geen-voorstelling', leadId: l.id, company, days: d, advice: 'Afspraak gehad, nog geen voorstelling' })
    }
  }
  for (const p of data.openProposals) {
    const d = daysSince(Date.parse(p.createdOn))
    if (d >= 30) followUps.push({ kind: 'voorstelling-loopt', proposalId: p.id, company: p.accountName ?? p.name, days: d, advice: 'Voorstelling wacht op een beslissing' })
  }
  followUps.sort((a, b) => b.days - a.days)

  const thin = cohort.length + channels.reduce((s, c) => s + c.contacted, 0) < 5
  const insights = buildInsights({ kpis, funnel, channels, bestChannel, rankBy, followUps, thin, prevLabel: r.prevLabel })

  return { kpis, funnel, channels, bestChannel, contactsPerWeek, customersPerMonth, followUps, insights, thin }
}

function otherChannelAdvice(last: ContactChannel | undefined, best: ContactChannel | undefined): string {
  if (best && best !== last) return `Probeer via ${CHANNEL_LABELS[best].toLowerCase()}.`
  const alt = (Object.keys(CHANNEL_LABELS) as ContactChannel[]).find((c) => c !== last)
  return alt ? `Probeer via ${CHANNEL_LABELS[alt].toLowerCase()}.` : 'Opnieuw contacteren.'
}

const p0 = (x?: number) => (x == null ? '–' : `${Math.round(x * 100)}%`)

/** "What could improve": a few plain sentences, only where the numbers support them. */
function buildInsights(d: {
  kpis: Kpi[]
  funnel: FunnelStep[]
  channels: ChannelRow[]
  bestChannel?: ContactChannel
  rankBy: 'customerRate' | 'meetingRate'
  followUps: FollowUp[]
  thin: boolean
  prevLabel: string
}): Insight[] {
  const out: Insight[] = []
  if (d.thin) {
    out.push({ tone: 'neutral', text: 'Te weinig gegevens in deze periode om conclusies te trekken. Kies een langere periode.' })
  }

  const ranked = d.channels.filter((c) => c.contacted >= MIN_FOR_RANKING)
  if (d.bestChannel && ranked.length > 1) {
    const best = ranked.find((c) => c.channel === d.bestChannel)!
    const others = ranked.filter((c) => c.channel !== d.bestChannel).map((c) => `${c.label.toLowerCase()} ${p0(c[d.rankBy])}`).join(', ')
    const what = d.rankBy === 'customerRate' ? 'wordt klant' : 'krijgt een afspraak'
    out.push({ tone: 'good', text: `${best.label} werkt het best: ${p0(best[d.rankBy])} van de leads ${what} (${others}). Zet het vaker in als eerste contact.` })
    const worst = [...ranked].sort((a, b) => (a.replyRate ?? 0) - (b.replyRate ?? 0))[0]
    if (worst.channel !== d.bestChannel && (worst.replyRate ?? 0) < 0.4) {
      out.push({ tone: 'attention', text: `${worst.label} krijgt de minste reactie (${p0(worst.replyRate)}). Volg sneller op, of kies een ander kanaal.` })
    }
  }

  // The biggest drop between two funnel steps, once there is enough to measure.
  // The last step (klant) is left out: a voorstelling takes weeks, so recent leads would always
  // look like a drop there. The akkoord rate is its own tile.
  const drops = d.funnel.slice(1, -1).filter((s, i) => d.funnel[i].count >= MIN_FOR_RANKING && s.fromPrevious != null)
  if (drops.length && !d.thin) {
    const worst = [...drops].sort((a, b) => (a.fromPrevious ?? 1) - (b.fromPrevious ?? 1))[0]
    const i = d.funnel.indexOf(worst)
    if ((worst.fromPrevious ?? 1) < 0.7) {
      out.push({ tone: 'attention', text: `De grootste uitval zit tussen ${d.funnel[i - 1].label.toLowerCase()} en ${worst.label.toLowerCase()}: maar ${p0(worst.fromPrevious)} gaat door.` })
    }
  }

  const klanten = d.kpis.find((k) => k.key === 'klanten')!
  if (klanten.previous != null && (klanten.value > 0 || klanten.previous > 0)) {
    const diff = klanten.value - klanten.previous
    if (diff !== 0) {
      out.push({ tone: diff > 0 ? 'good' : 'attention', text: `${Math.abs(diff)} klant${Math.abs(diff) === 1 ? '' : 'en'} ${diff > 0 ? 'meer' : 'minder'} dan ${d.prevLabel}.` })
    }
  }

  const waiting = d.followUps.filter((f) => f.kind === 'geen-reactie').length
  if (waiting) out.push({ tone: 'attention', text: `${waiting} lead${waiting === 1 ? '' : 's'} ${waiting === 1 ? 'kreeg' : 'kregen'} al een week geen reactie. Zie de opvolglijst.` })
  if (!out.length) out.push({ tone: 'neutral', text: 'Geen opvallende punten in deze periode.' })
  return out
}
