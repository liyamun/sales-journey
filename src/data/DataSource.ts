/**
 * The one seam between the screens and where data comes from.
 *
 * NO SCREEN TALKS TO DATAVERSE DIRECTLY. Every screen calls these methods and nothing else.
 * That is what lets the same screens run on Dataverse (`dataverseSource`) or on sample data
 * (`demoSource`, for `npm run dev:demo`) — the pattern from the Data Hub example.
 *
 * Each method is one step of the Klantreis, so the journey rules live in the data layer and not
 * scattered over buttons.
 */

import type {
  ContactChannel,
  Customer,
  DashboardData,
  JourneyCounts,
  Lead,
  NewProposal,
  NewProspect,
  Note,
  Proposal,
  Prospect,
  ProspectChange,
  ValidateInput,
} from './types'

export interface DataSource {
  readonly name: string

  getCounts(): Promise<JourneyCounts>

  /* 1 · Prospect ------------------------------------------------------------------------------ */
  getProspects(): Promise<Prospect[]>
  createProspect(input: NewProspect): Promise<string>
  updateProspect(id: string, change: ProspectChange): Promise<void>
  /** Analysis passed: create a koude lead for this company. Returns the lead id. */
  validateProspect(input: ValidateInput): Promise<string>
  /** Analysis failed: the company is not a fit. */
  rejectProspect(id: string): Promise<void>

  /* 2 · Lead ---------------------------------------------------------------------------------- */
  getLeads(): Promise<Lead[]>
  getNotes(recordKind: 'lead' | 'proposal', id: string): Promise<Note[]>
  /** Contact opnemen via tel, mail of netwerk. */
  logContact(leadId: string, channel: ContactChannel, note?: string): Promise<void>
  /** Afspraak? Ja -> warme lead. Nee -> gestopt. */
  recordMeeting(leadId: string, agreed: boolean, note?: string): Promise<void>
  /** Voorstelling geven: the warme lead becomes a voorstelling (opportunity). Returns its id. */
  startProposal(input: NewProposal): Promise<string>

  getProposals(): Promise<Proposal[]>
  /** Akkoord? Ja -> klant. Nee -> gestopt. */
  decideProposal(id: string, agreed: boolean, note?: string): Promise<void>

  /* 3 · Klant --------------------------------------------------------------------------------- */
  getCustomers(): Promise<Customer[]>

  /* Dashboard --------------------------------------------------------------------------------- */
  /** Every journey event (from the notes) plus the open leads and voorstellingen. */
  getDashboardData(): Promise<DashboardData>
}
