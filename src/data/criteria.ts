/**
 * The analysis criteria for a prospect (Klantreis, phase 1 "Analyseren").
 *
 * THE RULE: "Heeft genoeg geld" is a must, and at least 2 of the 3 criteria must be met.
 * So: genoeg geld + (meer dan 10 werknemers OR maakt producten).
 *
 * Change the numbers here — nowhere else. When the business wants to change them without a
 * developer, move them to a Dataverse settings table (see the self-service rule in the example).
 */

/** "Meer dan 10 werknemers" */
export const MIN_EMPLOYEES = 10

/**
 * "Heeft genoeg geld", read from the annual revenue on the account.
 * The threshold is an assumption — confirm it with your mentor.
 */
export const MIN_REVENUE_EUR = 1_000_000

export type CriterionResult = 'ok' | 'niet-ok' | 'onbekend'

export interface Criterion {
  key: 'employees' | 'revenue' | 'products'
  label: string
  /** A must-have: without it the prospect never passes, whatever else is met. */
  required: boolean
  result: CriterionResult
  detail: string
}

const eur = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function evaluate(p: { employees?: number; revenue?: number }, makesProducts: boolean | undefined): Criterion[] {
  return [
    {
      key: 'employees',
      label: `Meer dan ${MIN_EMPLOYEES} werknemers`,
      required: false,
      result: p.employees == null ? 'onbekend' : p.employees > MIN_EMPLOYEES ? 'ok' : 'niet-ok',
      detail: p.employees == null ? 'Aantal werknemers niet ingevuld' : `${p.employees} werknemers`,
    },
    {
      key: 'revenue',
      label: 'Heeft genoeg geld',
      required: true,
      result: p.revenue == null ? 'onbekend' : p.revenue >= MIN_REVENUE_EUR ? 'ok' : 'niet-ok',
      detail:
        p.revenue == null
          ? 'Jaaromzet niet ingevuld'
          : `Jaaromzet ${eur.format(p.revenue)} (minimum ${eur.format(MIN_REVENUE_EUR)})`,
    },
    {
      key: 'products',
      label: 'Maakt producten',
      required: false,
      result: makesProducts == null ? 'onbekend' : makesProducts ? 'ok' : 'niet-ok',
      detail: 'Beoordeel je zelf',
    },
  ]
}

/** How many criteria must be met in total, the required one included. */
export const MIN_MET = 2

export const metCount = (c: Criterion[]) => c.filter((x) => x.result === 'ok').length

/** Genoeg geld is a must, and at least MIN_MET of the criteria are met. */
export const isGoodProspect = (c: Criterion[]) =>
  c.every((x) => !x.required || x.result === 'ok') && metCount(c) >= MIN_MET

/** Why a prospect does not pass yet, in one Dutch sentence (empty when it passes). */
export function whyNot(c: Criterion[]): string {
  if (isGoodProspect(c)) return ''
  const money = c.find((x) => x.required)
  if (money && money.result !== 'ok') return 'Genoeg geld is verplicht.'
  return `Nog ${MIN_MET - metCount(c)} criterium extra nodig: minstens ${MIN_MET} van de 3.`
}

/** The note written on the lead at validation: which criteria were met. */
export const validationNote = (c: Criterion[]) =>
  c.filter((x) => x.result === 'ok').map((x) => x.label).join(', ') + '.'
