/**
 * Small visual building blocks shared by the screens (formatting lives in format.ts,
 * loading in hooks.ts).
 */

import { useEffect, type ReactNode } from 'react'
import type { JourneyStep, Note } from '../data/types'
import { STEP_LABELS } from '../data/types'
import { moment, phaseOf } from './format'

/* ---------- Visual pieces ---------- */

export function StepBadge({ step }: { step: JourneyStep }) {
  return <span className={`badge ${phaseOf(step)}`}>{STEP_LABELS[step]}</span>
}

const ORDER: JourneyStep[] = ['te-analyseren', 'koude-lead', 'warme-lead', 'voorstelling', 'klant']

/** Five bars: how far along the Klantreis this record is. */
export function Stepper({ step }: { step: JourneyStep }) {
  const at = ORDER.indexOf(step)
  return (
    <div className="stepper" aria-label={STEP_LABELS[step]} title={STEP_LABELS[step]}>
      {ORDER.map((s, i) => (
        <span key={s} className={`${i <= at ? 'done' : ''} ${phaseOf(s)}`} />
      ))}
    </div>
  )
}

export function ErrorBox({ message }: { message?: string }) {
  return message ? <div className="error" role="alert">{message}</div> : null
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  )
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={v === value} className={`tab ${v === value ? 'active' : ''}`} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Notes({ notes }: { notes?: Note[] }) {
  if (!notes) return <p className="hint">Geschiedenis laden…</p>
  if (!notes.length) return <p className="hint">Nog niets gebeurd.</p>
  return (
    <ul className="notes">
      {notes.map((n) => (
        <li key={n.id} className="note">
          <b>{n.subject}</b>
          <small>{moment(n.createdOn)}</small>
          {n.text && <p>{n.text}</p>}
        </li>
      ))}
    </ul>
  )
}

