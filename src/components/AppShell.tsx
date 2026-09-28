/**
 * The rail follows the Klantreis: the three phases from the Miro board, each in its own colour.
 */

import type { ReactNode } from 'react'
import type { JourneyCounts } from '../data/types'

export type ScreenId = 'overview' | 'prospects' | 'leads' | 'proposals' | 'customers' | 'dashboard'

interface Item {
  id: ScreenId
  label: string
  count?: (c: JourneyCounts) => number
}

const GROUPS: { title: string; color: string; items: Item[] }[] = [
  { title: '1 · Prospect', color: 'var(--prospect)', items: [{ id: 'prospects', label: 'Prospects', count: (c) => c.prospects }] },
  {
    title: '2 · Lead',
    color: 'var(--lead)',
    items: [
      { id: 'leads', label: 'Leads', count: (c) => c.coldLeads + c.warmLeads },
      { id: 'proposals', label: 'Voorstellingen', count: (c) => c.proposals },
    ],
  },
  { title: '3 · Klant', color: 'var(--klant)', items: [{ id: 'customers', label: 'Klanten', count: (c) => c.customers }] },
  { title: 'Inzicht', color: 'var(--p600)', items: [{ id: 'dashboard', label: 'Dashboard' }] },
]

export function AppShell({
  screen,
  counts,
  sourceName,
  onNavigate,
  children,
}: {
  screen: ScreenId
  counts?: JourneyCounts
  sourceName: string
  onNavigate: (s: ScreenId) => void
  children: ReactNode
}) {
  const item = (it: Item) => (
    <button key={it.id} className={`rail-item ${screen === it.id ? 'active' : ''}`} onClick={() => onNavigate(it.id)}>
      <span>{it.label}</span>
      {it.count && counts && <span className="rail-count">{it.count(counts)}</span>}
    </button>
  )
  return (
    <div className="shell">
      <nav className="rail" aria-label="Menu">
        <div className="brand">
          <div className="brand-org">365Titans</div>
          <div className="brand-name">Sales Journey</div>
        </div>
        {item({ id: 'overview', label: 'Overzicht' })}
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="rail-group" style={{ color: g.color }}>
              <span className="dot" style={{ background: g.color }} />
              {g.title}
            </div>
            {g.items.map(item)}
          </div>
        ))}
        <div className="rail-foot">Gegevens: {sourceName}</div>
      </nav>
      <main className="main">{children}</main>
    </div>
  )
}
