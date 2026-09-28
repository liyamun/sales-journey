/** Formatting and small pure helpers, shared by the screens. */

import type { JourneyStep } from '../data/types'

/* ---------- Formatting ---------- */

const eur = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const date = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTime = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const money = (n?: number) => (n == null ? '—' : eur.format(n))
export const day = (iso?: string) => (iso ? date.format(new Date(iso)) : '—')
export const moment = (iso?: string) => (iso ? dateTime.format(new Date(iso)) : '')
export const orDash = (s?: string | number) => (s == null || s === '' ? '—' : String(s))

export function phaseOf(step: JourneyStep): 'prospect' | 'lead' | 'klant' | 'stop' {
  if (step === 'te-analyseren') return 'prospect'
  if (step === 'klant') return 'klant'
  if (step === 'gestopt' || step === 'niet-geschikt') return 'stop'
  return 'lead'
}

/** Parses "1.200.000" or "1200000" as a number; empty stays undefined. */
export function parseNumber(s: string): number | undefined {
  const clean = s.replace(/[\s.€]/g, '').replace(',', '.')
  if (!clean) return undefined
  const n = Number(clean)
  return Number.isFinite(n) ? n : undefined
}
