/**
 * The shapes the screens work with. Nothing here knows about Dataverse: `dataverseSource.ts`
 * turns rows into these, `demoSource.ts` builds them from sample data.
 *
 * Internal names are English, everything a user sees is Dutch (same rule as the Data Hub example).
 */

/** Where a company is in the Klantreis, from the Miro board: Prospect -> Lead -> Klant. */
export type JourneyStep =
  | 'te-analyseren' // Prospect: nog niet geanalyseerd
  | 'koude-lead' // Lead: gevalideerd, nog geen afspraak
  | 'warme-lead' // Lead: afspraak gemaakt
  | 'voorstelling' // Lead: voorstelling loopt (een opportunity)
  | 'klant' // Klant: akkoord gekregen
  | 'gestopt' // Nee op afspraak of op voorstelling
  | 'niet-geschikt' // Viel af bij de analyse

export const STEP_LABELS: Record<JourneyStep, string> = {
  'te-analyseren': 'Te analyseren',
  'koude-lead': 'Koude lead',
  'warme-lead': 'Warme lead',
  voorstelling: 'Voorstelling',
  klant: 'Klant',
  gestopt: 'Gestopt',
  'niet-geschikt': 'Niet geschikt',
}

/** A company we are looking at. In Dataverse: an `account` with relation type Prospect. */
export interface Prospect {
  id: string
  name: string
  employees?: number
  /** Annual revenue in EUR (`account.revenue`). Used for "heeft genoeg geld". */
  revenue?: number
  industry?: string
  city?: string
  phone?: string
  email?: string
  website?: string
  createdOn: string
  step: JourneyStep
}

export interface NewProspect {
  name: string
  employees?: number
  revenue?: number
  city?: string
  phone?: string
  email?: string
  website?: string
}

export type ProspectChange = Partial<Omit<NewProspect, 'name'>>

export interface ContactPerson {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
}

/** Valideren: the analysis passed, the prospect becomes a koude lead. */
export interface ValidateInput {
  prospectId: string
  /** "Maakt producten" is judged by a person; the other two criteria come from the data. */
  makesProducts: boolean
  contact?: ContactPerson
}

export type LeadTemperature = 'koud' | 'warm'
export type LeadState = 'open' | 'gekwalificeerd' | 'gestopt'

/** In Dataverse: a `lead`. Koud/warm is the standard lead rating (`leadqualitycode`). */
export interface Lead {
  id: string
  subject: string
  companyName?: string
  accountId?: string
  firstName?: string
  lastName?: string
  email?: string
  phone?: string
  temperature: LeadTemperature
  state: LeadState
  /** Status reason "Contact opgenomen". */
  contacted: boolean
  createdOn: string
}

export type ContactChannel = 'telefoon' | 'mail' | 'netwerk'

export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  telefoon: 'Telefoon',
  mail: 'Mail',
  netwerk: 'Netwerk',
}

/** A line in a record's history. In Dataverse: an `annotation` (notitie). */
export interface Note {
  id: string
  subject: string
  text?: string
  createdOn: string
}

export type ProposalState = 'open' | 'akkoord' | 'geweigerd'

/** A voorstelling. In Dataverse: an `opportunity`, won or lost through the platform's own actions. */
export interface Proposal {
  id: string
  name: string
  accountId?: string
  accountName?: string
  leadId?: string
  estimatedValue?: number
  description?: string
  state: ProposalState
  createdOn: string
  closedOn?: string
}

export interface NewProposal {
  leadId: string
  name: string
  estimatedValue?: number
  description?: string
}

/**
 * The phases after akkoord. Only Fase 0 is known today; the rest is "..." on the Miro board.
 * Add them here when they are defined.
 */
export type CustomerPhase = 'fase-0'

export const PHASE_LABELS: Record<CustomerPhase, string> = {
  'fase-0': 'Fase 0 · Luisteren',
}

/** In Dataverse: an `account` with relation type Klant. */
export interface Customer {
  id: string
  name: string
  city?: string
  phone?: string
  email?: string
  phase: CustomerPhase
  since?: string
}

export interface JourneyCounts {
  prospects: number
  coldLeads: number
  warmLeads: number
  proposals: number
  customers: number
}

/* ---------- Dashboard ---------- */

export type JourneyEventKind =
  | 'gevalideerd'
  | 'contact'
  | 'afspraak-ja'
  | 'afspraak-nee'
  | 'voorstelling'
  | 'akkoord'
  | 'geweigerd'

/** One thing that happened in the Klantreis, read back from the notes the steps write. */
export interface JourneyEvent {
  kind: JourneyEventKind
  on: string
  /** Every event is attributed to the lead it started from, so a klant can be traced to its channel. */
  leadId: string
  company?: string
  channel?: ContactChannel
  /** The voorstelling's estimated value, on voorstelling / akkoord / geweigerd. */
  value?: number
}

export interface DashboardData {
  events: JourneyEvent[]
  /** The current state, for the follow-up list. */
  openLeads: Lead[]
  openProposals: Proposal[]
}
