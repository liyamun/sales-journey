/**
 * The Klantreis on the STANDARD Dynamics 365 Sales tables — no custom tables, so the records
 * are the same ones Sales Hub shows.
 *
 *   Klantreis                      Dataverse
 *   ----------------------------   -------------------------------------------------------------
 *   1 Prospect                     account, relation type (customertypecode) = Prospect
 *     Analyseren                   account.numberofemployees, account.revenue
 *     Valideren                    creates a lead linked to the account (parentaccountid)
 *   2 Koude lead                   lead, rating (leadqualitycode) = Cold
 *     Contact via tel/mail/netw.   lead status reason = Contacted + a note (annotation)
 *     Afspraak? Ja                 lead rating = Warm
 *     Afspraak? Nee                lead disqualified (No longer interested)
 *     Voorstelling                 opportunity from the lead; lead qualified
 *     Akkoord? Ja                  WinOpportunity + account relation type = Customer
 *     Akkoord? Nee                 LoseOpportunity
 *   3 Klant, Fase 0                account, relation type = Customer
 *
 * The choice numbers below are the platform's standard values. If your environment was customised
 * and they differ, change them HERE and nowhere else.
 */

import type { DataSource } from './DataSource'
import type { Customer, JourneyEvent, JourneyStep, Lead, Note, Proposal, Prospect } from './types'
import { NOTE, kindOf } from './journeyNotes'
import { evaluate, isGoodProspect, validationNote } from './criteria'
import { createRow, label, listRows, literal, num, opt, runAction, str, updateRow, withoutEmpty, type DvRow } from './dataverse'

const ACCOUNT_TYPE = { customer: 3, prospect: 8 } as const
const ACCOUNT_STATE = { active: 0, inactive: 1 } as const
const LEAD_STATE = { open: 0, qualified: 1, disqualified: 2 } as const
const LEAD_STATUS = { new: 1, contacted: 2, qualified: 3, noLongerInterested: 6 } as const
const LEAD_RATING = { hot: 1, warm: 2, cold: 3 } as const
const OPPORTUNITY_STATE = { open: 0, won: 1, lost: 2 } as const
const OPPORTUNITY_STATUS = { won: 3, canceled: 4 } as const

const ACCOUNT_SELECT =
  'accountid,name,numberofemployees,revenue,industrycode,address1_city,telephone1,emailaddress1,websiteurl,statecode,customertypecode,createdon'
const LEAD_SELECT =
  'leadid,subject,companyname,firstname,lastname,emailaddress1,telephone1,leadqualitycode,statecode,statuscode,_parentaccountid_value,createdon'
const OPPORTUNITY_SELECT =
  'opportunityid,name,_parentaccountid_value,_originatingleadid_value,estimatedvalue,description,statecode,createdon,actualclosedate'

/* Row -> shape ----------------------------------------------------------------------------------- */

function toLead(r: DvRow): Lead {
  const state = num(r, 'statecode')
  return {
    id: str(r, 'leadid'),
    subject: str(r, 'subject'),
    companyName: opt(r, 'companyname'),
    accountId: opt(r, '_parentaccountid_value'),
    firstName: opt(r, 'firstname'),
    lastName: opt(r, 'lastname'),
    email: opt(r, 'emailaddress1'),
    phone: opt(r, 'telephone1'),
    // Hot and Warm are both "warm" in the Klantreis. Note: Dynamics gives a NEW lead the rating Warm
    // by default, so leads created outside this app start as warme leads.
    temperature: num(r, 'leadqualitycode') === LEAD_RATING.cold ? 'koud' : 'warm',
    state: state === LEAD_STATE.qualified ? 'gekwalificeerd' : state === LEAD_STATE.disqualified ? 'gestopt' : 'open',
    contacted: num(r, 'statuscode') === LEAD_STATUS.contacted,
    createdOn: str(r, 'createdon'),
  }
}

function toProposal(r: DvRow): Proposal {
  const state = num(r, 'statecode')
  return {
    id: str(r, 'opportunityid'),
    name: str(r, 'name'),
    accountId: opt(r, '_parentaccountid_value'),
    accountName: label(r, '_parentaccountid_value'),
    leadId: opt(r, '_originatingleadid_value'),
    estimatedValue: num(r, 'estimatedvalue'),
    description: opt(r, 'description'),
    state: state === OPPORTUNITY_STATE.won ? 'akkoord' : state === OPPORTUNITY_STATE.lost ? 'geweigerd' : 'open',
    createdOn: str(r, 'createdon'),
    closedOn: opt(r, 'actualclosedate'),
  }
}

/**
 * Where a prospect account stands, from its leads and voorstellingen (newest first).
 * Kept as ONE function so the rule is readable in one place.
 */
function stepOf(account: DvRow, leads: Lead[], proposals: Proposal[]): JourneyStep {
  if (num(account, 'statecode') === ACCOUNT_STATE.inactive) return 'niet-geschikt'
  if (proposals.some((p) => p.state === 'open')) return 'voorstelling'
  const lead = leads[0]
  if (lead?.state === 'open') return lead.temperature === 'koud' ? 'koude-lead' : 'warme-lead'
  if (lead || proposals.length) return 'gestopt'
  return 'te-analyseren'
}

function groupBy<T>(items: T[], key: (t: T) => string | undefined): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const it of items) {
    const k = key(it)
    if (!k) continue
    m.set(k, [...(m.get(k) ?? []), it])
  }
  return m
}

/** A note on a lead or opportunity — the history of the journey. */
async function addNote(kind: 'lead' | 'proposal', id: string, subject: string, text?: string): Promise<void> {
  const bind = kind === 'lead' ? { 'objectid_lead@odata.bind': `/leads(${id})` } : { 'objectid_opportunity@odata.bind': `/opportunities(${id})` }
  await createRow('annotations', 'annotationid', withoutEmpty({ subject, notetext: text?.trim(), ...bind }))
}

async function getLeadRow(id: string): Promise<Lead> {
  const rows = await listRows('leads', { select: LEAD_SELECT, filter: `leadid eq ${id}` })
  if (!rows[0]) throw new Error('Deze lead bestaat niet meer.')
  return toLead(rows[0])
}

async function getProposalRow(id: string): Promise<Proposal> {
  const rows = await listRows('opportunities', { select: OPPORTUNITY_SELECT, filter: `opportunityid eq ${id}` })
  if (!rows[0]) throw new Error('Deze voorstelling bestaat niet meer.')
  return toProposal(rows[0])
}

function closeBody(id: string, subject: string) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.opportunityclose',
    subject,
    'opportunityid@odata.bind': `/opportunities(${id})`,
  }
}

export const dataverseSource: DataSource = {
  name: 'Dataverse',

  async getCounts() {
    const [prospects, leads, proposals, customers] = await Promise.all([
      this.getProspects(),
      listRows('leads', { select: 'leadid,leadqualitycode', filter: `statecode eq ${LEAD_STATE.open}` }),
      listRows('opportunities', { select: 'opportunityid', filter: `statecode eq ${OPPORTUNITY_STATE.open}` }),
      listRows('accounts', {
        select: 'accountid',
        filter: `customertypecode eq ${ACCOUNT_TYPE.customer} and statecode eq ${ACCOUNT_STATE.active}`,
      }),
    ])
    const cold = leads.filter((l) => num(l, 'leadqualitycode') === LEAD_RATING.cold).length
    return {
      prospects: prospects.filter((p) => p.step === 'te-analyseren').length,
      coldLeads: cold,
      warmLeads: leads.length - cold,
      proposals: proposals.length,
      customers: customers.length,
    }
  },

  /* 1 · Prospect ------------------------------------------------------------------------------ */

  async getProspects() {
    const [accounts, leadRows, proposalRows] = await Promise.all([
      listRows('accounts', {
        select: ACCOUNT_SELECT,
        filter: `customertypecode eq ${ACCOUNT_TYPE.prospect}`,
        orderby: 'createdon desc',
      }),
      listRows('leads', { select: LEAD_SELECT, filter: '_parentaccountid_value ne null', orderby: 'createdon desc' }),
      listRows('opportunities', {
        select: OPPORTUNITY_SELECT,
        filter: '_parentaccountid_value ne null',
        orderby: 'createdon desc',
      }),
    ])
    const leads = groupBy(leadRows.map(toLead), (l) => l.accountId)
    const proposals = groupBy(proposalRows.map(toProposal), (p) => p.accountId)
    return accounts.map((a): Prospect => {
      const id = str(a, 'accountid')
      return {
        id,
        name: str(a, 'name'),
        employees: num(a, 'numberofemployees'),
        revenue: num(a, 'revenue'),
        industry: label(a, 'industrycode'),
        city: opt(a, 'address1_city'),
        phone: opt(a, 'telephone1'),
        email: opt(a, 'emailaddress1'),
        website: opt(a, 'websiteurl'),
        createdOn: str(a, 'createdon'),
        step: stepOf(a, leads.get(id) ?? [], proposals.get(id) ?? []),
      }
    })
  },

  async createProspect(input) {
    const name = input.name.trim()
    if (!name) throw new Error('Geef de naam van het bedrijf.')
    return createRow(
      'accounts',
      'accountid',
      withoutEmpty({
        name,
        customertypecode: ACCOUNT_TYPE.prospect,
        numberofemployees: input.employees,
        revenue: input.revenue,
        address1_city: input.city?.trim(),
        telephone1: input.phone?.trim(),
        emailaddress1: input.email?.trim(),
        websiteurl: input.website?.trim(),
      }),
      { filter: `name eq ${literal(name)}` },
    )
  },

  async updateProspect(id, change) {
    const body: Record<string, unknown> = {}
    if (change.employees !== undefined) body.numberofemployees = change.employees
    if (change.revenue !== undefined) body.revenue = change.revenue
    if (change.city !== undefined) body.address1_city = change.city
    if (change.phone !== undefined) body.telephone1 = change.phone
    if (change.email !== undefined) body.emailaddress1 = change.email
    if (change.website !== undefined) body.websiteurl = change.website
    if (Object.keys(body).length) await updateRow('accounts', id, body)
  },

  async validateProspect({ prospectId, makesProducts, contact }) {
    const rows = await listRows('accounts', { select: ACCOUNT_SELECT, filter: `accountid eq ${prospectId}` })
    const a = rows[0]
    if (!a) throw new Error('Dit bedrijf bestaat niet meer.')
    // The same rule the screen shows, checked again here: a button is not a guarantee.
    const employees = num(a, 'numberofemployees')
    const revenue = num(a, 'revenue')
    const criteria = evaluate({ employees, revenue }, makesProducts)
    if (!isGoodProspect(criteria)) {
      throw new Error('De analyse is niet in orde: genoeg geld is verplicht, en minstens 2 van de 3 criteria moeten kloppen.')
    }
    const open = await listRows('leads', {
      select: 'leadid',
      filter: `_parentaccountid_value eq ${prospectId} and statecode eq ${LEAD_STATE.open}`,
    })
    if (open[0]) return str(open[0], 'leadid')

    const name = str(a, 'name')
    const leadId = await createRow(
      'leads',
      'leadid',
      withoutEmpty({
        subject: name,
        companyname: name,
        firstname: contact?.firstName?.trim(),
        lastname: contact?.lastName?.trim(),
        emailaddress1: contact?.email?.trim(),
        telephone1: contact?.phone?.trim(),
        numberofemployees: employees,
        revenue,
        leadqualitycode: LEAD_RATING.cold,
        'parentaccountid@odata.bind': `/accounts(${prospectId})`,
      }),
      { filter: `_parentaccountid_value eq ${prospectId}` },
    )
    await addNote('lead', leadId, NOTE.validated, validationNote(criteria))
    return leadId
  },

  async rejectProspect(id) {
    await updateRow('accounts', id, { statecode: ACCOUNT_STATE.inactive, statuscode: 2 })
  },

  /* 2 · Lead ---------------------------------------------------------------------------------- */

  async getLeads() {
    const rows = await listRows('leads', { select: LEAD_SELECT, orderby: 'createdon desc' })
    return rows.map(toLead)
  },

  async getNotes(kind, id): Promise<Note[]> {
    const rows = await listRows('annotations', {
      select: 'annotationid,subject,notetext,createdon',
      filter: `_objectid_value eq ${id}`,
      orderby: 'createdon desc',
    })
    void kind
    return rows.map((r) => ({
      id: str(r, 'annotationid'),
      subject: str(r, 'subject'),
      text: opt(r, 'notetext'),
      createdOn: str(r, 'createdon'),
    }))
  },

  async logContact(leadId, channel, note) {
    const lead = await getLeadRow(leadId)
    if (lead.state !== 'open') throw new Error('Deze lead is al afgesloten.')
    await addNote('lead', leadId, NOTE.contact(channel), note)
    if (!lead.contacted) await updateRow('leads', leadId, { statuscode: LEAD_STATUS.contacted })
  },

  async recordMeeting(leadId, agreed, note) {
    const lead = await getLeadRow(leadId)
    if (lead.state !== 'open') throw new Error('Deze lead is al afgesloten.')
    if (agreed) {
      await addNote('lead', leadId, NOTE.meetingYes, note)
      await updateRow('leads', leadId, { leadqualitycode: LEAD_RATING.warm })
    } else {
      // The note first: a disqualified lead is read-only.
      await addNote('lead', leadId, NOTE.meetingNo, note)
      await updateRow('leads', leadId, { statecode: LEAD_STATE.disqualified, statuscode: LEAD_STATUS.noLongerInterested })
    }
  },

  async startProposal({ leadId, name, estimatedValue, description }) {
    const lead = await getLeadRow(leadId)

    // Idempotent: if an earlier attempt created the opportunity but failed to close the lead,
    // a retry finishes that attempt instead of making a second one (lesson from the example).
    const existing = await listRows('opportunities', { select: 'opportunityid', filter: `_originatingleadid_value eq ${leadId}` })
    if (lead.state !== 'open') {
      if (existing[0]) return str(existing[0], 'opportunityid')
      throw new Error('Deze lead is al afgesloten.')
    }
    if (lead.temperature !== 'warm') throw new Error('Eerst een afspraak: alleen een warme lead krijgt een voorstelling.')

    let opportunityId = existing[0] ? str(existing[0], 'opportunityid') : ''
    if (!opportunityId) {
      const accountId =
        lead.accountId ??
        (await this.createProspect({ name: lead.companyName || lead.subject }))
      opportunityId = await createRow(
        'opportunities',
        'opportunityid',
        withoutEmpty({
          name: name.trim() || `Voorstelling ${lead.companyName ?? lead.subject}`,
          description: description?.trim(),
          estimatedvalue: estimatedValue,
          'customerid_account@odata.bind': `/accounts(${accountId})`,
          'parentaccountid@odata.bind': `/accounts(${accountId})`,
          'originatingleadid@odata.bind': `/leads(${leadId})`,
        }),
        { filter: `_originatingleadid_value eq ${leadId}` },
      )
      await addNote('proposal', opportunityId, NOTE.proposal)
    }
    // Last, so a failure above leaves an open lead that can simply try again.
    await updateRow('leads', leadId, { statecode: LEAD_STATE.qualified, statuscode: LEAD_STATUS.qualified })
    return opportunityId
  },

  async getProposals() {
    const rows = await listRows('opportunities', { select: OPPORTUNITY_SELECT, orderby: 'createdon desc' })
    return rows.map(toProposal)
  },

  async decideProposal(id, agreed, note) {
    const p = await getProposalRow(id)
    if (p.state !== 'open') throw new Error('Over deze voorstelling is al beslist.')
    // Note before closing: a closed opportunity is read-only.
    await addNote('proposal', id, agreed ? NOTE.agreed : NOTE.refused, note)
    if (agreed) {
      // A PATCH of statecode is refused for opportunities; WinOpportunity is the platform's own door.
      await runAction('WinOpportunity', { Status: OPPORTUNITY_STATUS.won, OpportunityClose: closeBody(id, 'Akkoord op voorstelling') })
      if (p.accountId) await updateRow('accounts', p.accountId, { customertypecode: ACCOUNT_TYPE.customer })
    } else {
      await runAction('LoseOpportunity', { Status: OPPORTUNITY_STATUS.canceled, OpportunityClose: closeBody(id, 'Geen akkoord') })
    }
  },

  /* 3 · Klant --------------------------------------------------------------------------------- */

  async getCustomers() {
    const [accounts, won] = await Promise.all([
      listRows('accounts', {
        select: ACCOUNT_SELECT,
        filter: `customertypecode eq ${ACCOUNT_TYPE.customer} and statecode eq ${ACCOUNT_STATE.active}`,
        orderby: 'name',
      }),
      listRows('opportunities', {
        select: '_parentaccountid_value,actualclosedate',
        filter: `statecode eq ${OPPORTUNITY_STATE.won}`,
        orderby: 'actualclosedate desc',
      }),
    ])
    const since = new Map<string, string>()
    for (const w of won) {
      const k = str(w, '_parentaccountid_value')
      if (k && !since.has(k)) since.set(k, str(w, 'actualclosedate'))
    }
    return accounts.map((a): Customer => {
      const id = str(a, 'accountid')
      return {
        id,
        name: str(a, 'name'),
        city: opt(a, 'address1_city'),
        phone: opt(a, 'telephone1'),
        email: opt(a, 'emailaddress1'),
        // Only Fase 0 exists today. When the next phases are defined, they need a column to live in.
        phase: 'fase-0',
        since: since.get(id) || undefined,
      }
    })
  },

  /* Dashboard --------------------------------------------------------------------------------- */

  async getDashboardData() {
    const [notes, opportunities, leads] = await Promise.all([
      listRows('annotations', {
        select: 'subject,createdon,_objectid_value,objecttypecode',
        filter: "objecttypecode eq 'lead' or objecttypecode eq 'opportunity'",
        orderby: 'createdon asc',
      }),
      listRows('opportunities', { select: OPPORTUNITY_SELECT }),
      listRows('leads', { select: LEAD_SELECT }),
    ])
    const proposals = opportunities.map(toProposal)
    const allLeads = leads.map(toLead)
    const byOpportunity = new Map(proposals.map((p) => [p.id, p]))
    const byLead = new Map(allLeads.map((l) => [l.id, l]))

    const events: JourneyEvent[] = []
    for (const n of notes) {
      const meaning = kindOf(str(n, 'subject'))
      if (!meaning) continue
      const objectId = str(n, '_objectid_value')
      // A voorstelling's notes are attributed to the lead it came from.
      const proposal = byOpportunity.get(objectId)
      const leadId = proposal ? proposal.leadId : objectId
      if (!leadId) continue
      const lead = byLead.get(leadId)
      events.push({
        kind: meaning.kind,
        channel: meaning.channel,
        on: str(n, 'createdon'),
        leadId,
        company: lead?.companyName ?? proposal?.accountName ?? lead?.subject,
        value: proposal?.estimatedValue,
      })
    }
    return {
      events,
      openLeads: allLeads.filter((l) => l.state === 'open'),
      openProposals: proposals.filter((p) => p.state === 'open'),
    }
  },
}
