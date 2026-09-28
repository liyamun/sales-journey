/**
 * Overzicht: the Klantreis from the Miro board, with the live numbers in it.
 */

import type { ScreenId } from '../components/AppShell'
import { PageHead } from '../components/ui'
import { MIN_EMPLOYEES } from '../data/criteria'
import type { JourneyCounts } from '../data/types'
import type { LeadFilter } from './Leads'

export function Overview({ counts, onOpen }: { counts?: JourneyCounts; onOpen: (s: ScreenId, f?: LeadFilter) => void }) {
  const n = (v?: number) => (v == null ? '…' : v)
  return (
    <>
      <PageHead title="Klantreis" sub="Van prospect tot klant. Klik op een stap om de lijst te openen.">
        <button className="btn primary" onClick={() => onOpen('dashboard')}>
          Naar het dashboard
        </button>
      </PageHead>

      <div className="journey">
        <section className="phase prospect">
          <div className="phase-head">
            <span className="phase-num" style={{ background: 'var(--prospect)' }}>1</span>
            <span className="phase-title">Prospect</span>
          </div>
          <div className="phase-steps">
            <button className="step-tile" onClick={() => onOpen('prospects')}>
              <div className="n">{n(counts?.prospects)}</div>
              <div className="l">Te analyseren</div>
            </button>
          </div>
        </section>

        <section className="phase lead">
          <div className="phase-head">
            <span className="phase-num" style={{ background: 'var(--lead)' }}>2</span>
            <span className="phase-title">Lead</span>
          </div>
          <div className="phase-steps">
            <button className="step-tile" onClick={() => onOpen('leads', 'koud')}>
              <div className="n">{n(counts?.coldLeads)}</div>
              <div className="l">Koude leads</div>
            </button>
            <button className="step-tile" onClick={() => onOpen('leads', 'warm')}>
              <div className="n">{n(counts?.warmLeads)}</div>
              <div className="l">Warme leads</div>
            </button>
            <button className="step-tile" onClick={() => onOpen('proposals')}>
              <div className="n">{n(counts?.proposals)}</div>
              <div className="l">Voorstellingen</div>
            </button>
          </div>
        </section>

        <section className="phase klant">
          <div className="phase-head">
            <span className="phase-num" style={{ background: 'var(--klant)' }}>3</span>
            <span className="phase-title">Klant</span>
          </div>
          <div className="phase-steps">
            <button className="step-tile" onClick={() => onOpen('customers')}>
              <div className="n">{n(counts?.customers)}</div>
              <div className="l">In Fase 0</div>
            </button>
          </div>
        </section>
      </div>

      <div className="rules">
        <div className="card card-pad">
          <h3>1 · Prospect</h3>
          <ul>
            <li>Analyseren: genoeg geld, meer dan {MIN_EMPLOYEES} werknemers, maakt producten</li>
            <li>Valideren: genoeg geld is verplicht, en minstens 2 van de 3 kloppen</li>
          </ul>
        </div>
        <div className="card card-pad">
          <h3>2 · Lead</h3>
          <ul>
            <li>Koude lead: contact via tel, mail of netwerk</li>
            <li>Afspraak? Nee: stop. Ja: warme lead</li>
            <li>Voorstelling geven en verdedigen</li>
            <li>Akkoord? Nee: stop. Ja: klant</li>
          </ul>
        </div>
        <div className="card card-pad">
          <h3>3 · Klant</h3>
          <ul>
            <li>Fase 0: luisteren</li>
            <li>Volgende fases volgen nog</li>
          </ul>
        </div>
      </div>
    </>
  )
}
