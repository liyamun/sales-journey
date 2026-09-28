/**
 * The transport to Dataverse: the Microsoft Dataverse connector, through the signed-in user's
 * connection. Only this file calls `MicrosoftDataverseService`.
 *
 * Works both in `npm run dev` (open the Local Play URL the Power Apps plugin prints) and in the
 * published app. Adapted from the Data Hub example's dataverseSource.ts, which learned these the
 * hard way — the comments say why.
 */

import { getContext } from '@microsoft/power-apps/app'
import { MicrosoftDataverseService } from '../generated/services/MicrosoftDataverseService'

/** Ask Dataverse for choice LABELS beside the numbers, so the app never keeps a copy of an option set. */
const PREFER = 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"'
export const LABEL = '@OData.Community.Display.V1.FormattedValue'

export interface DvRow {
  [k: string]: unknown
}

export interface Query {
  select?: string
  filter?: string
  orderby?: string
  top?: number
}

/**
 * Every call names the organization explicitly (the *WithOrganization operations).
 * The example measured that the "current environment" operations can fail with
 * `Invalid organization URL 'null'`; the same request with the org URL works.
 */
let orgUrl: Promise<string> | undefined
function organization(): Promise<string> {
  orgUrl ??= getContext().then((c) => {
    const url = c.app.dataverseOrgUrl
    if (!url) throw new Error('De Power Apps-host gaf geen Dataverse-URL. Open de app via de Local Play-link of de gepubliceerde app.')
    return url.replace(/\/+$/, '')
  })
  return orgUrl
}

/** The generated model types a row as { dynamicProperties }; accept both shapes. */
function unwrapRow(v: unknown): DvRow {
  const dyn = (v as { dynamicProperties?: unknown }).dynamicProperties
  return (dyn && typeof dyn === 'object' ? dyn : v) as DvRow
}

function fail(what: string, error?: { message?: string }): never {
  throw new Error(`Dataverse ${what}: ${error?.message ?? 'onbekende fout'}`)
}

export async function listRows(entitySet: string, q: Query = {}): Promise<DvRow[]> {
  const res = await MicrosoftDataverseService.ListRecordsWithOrganization(
    await organization(), entitySet, PREFER, 'application/json', undefined, undefined,
    q.select, q.filter, q.orderby, undefined, undefined, q.top,
  )
  if (!res.success) fail(`bij lezen van ${entitySet}`, res.error)
  return (((res.data as { value?: unknown[] } | undefined)?.value) ?? []).map(unwrapRow)
}

/**
 * Creates a row and returns its id. The connector's CreateRecord is typed `void`: we ask for the
 * representation, and when it does not come back `fallback` finds the newest matching row.
 */
export async function createRow(
  entitySet: string,
  idField: string,
  body: Record<string, unknown>,
  fallback?: Query,
): Promise<string> {
  const res = await MicrosoftDataverseService.CreateRecordWithOrganization(
    'return=representation', 'application/json', await organization(), entitySet, body,
  )
  if (!res.success) fail(`bij aanmaken in ${entitySet}`, res.error)
  const data: unknown = res.data
  if (data && typeof data === 'object') {
    const row = unwrapRow(data)
    if (row[idField]) return String(row[idField])
  }
  if (fallback) {
    const rows = await listRows(entitySet, { ...fallback, select: idField, orderby: 'createdon desc', top: 1 })
    if (rows[0]?.[idField]) return String(rows[0][idField])
  }
  throw new Error(`De rij in ${entitySet} is aangemaakt, maar Dataverse gaf geen id terug.`)
}

/** UpdateOnlyRecord with If-Match: * — never the upsert, which would quietly CREATE a missing row. */
export async function updateRow(entitySet: string, id: string, body: Record<string, unknown>): Promise<void> {
  const res = await MicrosoftDataverseService.UpdateOnlyRecordWithOrganization(
    'return=representation', 'application/json', '*', await organization(), entitySet, id, body,
  )
  if (!res.success) fail(`bij bijwerken van ${entitySet}`, res.error)
}

/** An unbound platform action, e.g. WinOpportunity. */
export async function runAction(name: string, body: Record<string, unknown>): Promise<void> {
  const res = await MicrosoftDataverseService.PerformUnboundActionWithOrganization(await organization(), name, body)
  if (!res.success) fail(`bij actie ${name}`, res.error)
}

/* Small helpers for reading rows ------------------------------------------------------------- */

export const str = (r: DvRow, k: string): string => (r[k] == null ? '' : String(r[k]))
export const opt = (r: DvRow, k: string): string | undefined => (r[k] == null || r[k] === '' ? undefined : String(r[k]))
export const num = (r: DvRow, k: string): number | undefined => (typeof r[k] === 'number' ? (r[k] as number) : undefined)
export const label = (r: DvRow, k: string): string | undefined => opt(r, `${k}${LABEL}`)

/** An OData string literal, quotes escaped. */
export const literal = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Drops undefined and empty strings, so we never overwrite a column with "". */
export function withoutEmpty(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== ''))
}
