/**
 * Phase 2 · Lead — the voorstelling (an opportunity): geven, verdedigen, akkoord of niet.
 */

import { useMemo, useState } from 'react'
import { Empty, ErrorBox, Field, Notes, PageHead, StepBadge, Stepper, Tabs } from '../components/ui'
import { day, money, orDash } from '../components/format'
import { useAction, useLoad } from '../components/hooks'
import { source } from '../data/source'
import type { JourneyStep, Proposal } from '../data/types'

type Filter = 'open' | 'beslist'

const stepOf = (p: Proposal): JourneyStep => (p.state === 'akkoord' ? 'klant' : p.state === 'geweigerd' ? 'gestopt' : 'voorstelling')

export function Proposals({ onChanged, onGoToCustomers }: { onChanged: (msg: string) => void; onGoToCustomers: () => void }) {
  const { data, error, loading, reload } = useLoad(() => source.getProposals())
  const [filter, setFilter] = useState<Filter>('open')
  const [selectedId, setSelectedId] = useState<string>()

  const rows = useMemo(() => (data ?? []).filter((p) => (filter === 'open' ? p.state === 'open' : p.state !== 'open')), [data, filter])
  const selected = data?.find((p) => p.id === selectedId)

  return (
    <>
      <PageHead title="Voorstellingen" sub="Voorstelling geven en verdedigen. Akkoord? Dan wordt het bedrijf klant." />

      <div className="toolbar">
        <Tabs value={filter} onChange={setFilter} options={[['open', 'Lopend'], ['beslist', 'Beslist']]} />
      </div>

      <ErrorBox message={error} />

      <div className={selected ? 'split' : ''}>
        <div className="card">
          {loading && !data ? (
            <Empty>Laden…</Empty>
          ) : rows.length === 0 ? (
            <Empty>{filter === 'open' ? 'Geen lopende voorstellingen.' : 'Nog niets beslist.'}</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Voorstelling</th>
                  <th>Bedrijf</th>
                  <th className="num">Waarde</th>
                  <th>Stap</th>
                  <th>{filter === 'open' ? 'Gestart' : 'Beslist'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={`row ${p.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(p.id)}>
                    <td>
                      <b>{p.name}</b>
                    </td>
                    <td className="muted">{orDash(p.accountName)}</td>
                    <td className="num">{money(p.estimatedValue)}</td>
                    <td>
                      <StepBadge step={stepOf(p)} />
                    </td>
                    <td className="muted nowrap">{day(filter === 'open' ? p.createdOn : p.closedOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <ProposalPanel
            key={selected.id}
            proposal={selected}
            onClose={() => setSelectedId(undefined)}
            onGoToCustomers={onGoToCustomers}
            onChanged={(msg) => {
              reload()
              onChanged(msg)
            }}
          />
        )}
      </div>
    </>
  )
}

function ProposalPanel({
  proposal: p,
  onClose,
  onChanged,
  onGoToCustomers,
}: {
  proposal: Proposal
  onClose: () => void
  onChanged: (msg: string) => void
  onGoToCustomers: () => void
}) {
  const notes = useLoad(() => source.getNotes('proposal', p.id))
  const action = useAction()
  const [note, setNote] = useState('')
  const step = stepOf(p)
  const who = p.accountName ?? 'Het bedrijf'

  const decide = (agreed: boolean) =>
    action.run(async () => {
      await source.decideProposal(p.id, agreed, note)
      notes.reload()
      onChanged(agreed ? `${who} is nu klant. Fase 0: luisteren.` : `De klantreis met ${who} is gestopt.`)
    })

  return (
    <aside className="card panel" aria-label={p.name}>
      <div className="panel-head">
        <div style={{ flex: 1 }}>
          <h2>{p.name}</h2>
          <StepBadge step={step} />
          <Stepper step={step} />
        </div>
        <button className="close" onClick={onClose} aria-label="Sluiten">
          ×
        </button>
      </div>

      <div className="panel-section">
        <h3>Voorstelling</h3>
        <dl className="facts">
          <dt>Bedrijf</dt>
          <dd>{orDash(p.accountName)}</dd>
          <dt>Waarde</dt>
          <dd>{money(p.estimatedValue)}</dd>
          <dt>Gestart</dt>
          <dd>{day(p.createdOn)}</dd>
          {p.closedOn && (
            <>
              <dt>Beslist</dt>
              <dd>{day(p.closedOn)}</dd>
            </>
          )}
        </dl>
        {p.description && <p style={{ margin: '10px 0 0', color: 'var(--text-2)' }}>{p.description}</p>}
      </div>

      {p.state === 'open' ? (
        <div className="panel-section">
          <h3>Akkoord?</h3>
          <Field label="Notitie">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Wat gaf de doorslag?" />
          </Field>
          <ErrorBox message={action.error} />
          <div className="btn-row">
            <button className="btn yes" disabled={action.busy} onClick={() => decide(true)}>
              Ja → klant
            </button>
            <button className="btn no" disabled={action.busy} onClick={() => decide(false)}>
              Nee → stop
            </button>
          </div>
        </div>
      ) : (
        p.state === 'akkoord' && (
          <div className="panel-section">
            <button className="btn" onClick={onGoToCustomers}>
              Naar de klanten
            </button>
          </div>
        )
      )}

      <div className="panel-section">
        <h3>Geschiedenis</h3>
        <ErrorBox message={notes.error} />
        <Notes notes={notes.data} />
      </div>
    </aside>
  )
}
