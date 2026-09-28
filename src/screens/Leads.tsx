/**
 * Phase 2 · Lead — koude lead, contact, afspraak, warme lead, voorstelling starten.
 */

import { useMemo, useState } from 'react'
import { Empty, ErrorBox, Field, Notes, PageHead, StepBadge, Stepper, Tabs } from '../components/ui'
import { day, orDash, parseNumber } from '../components/format'
import { useAction, useLoad } from '../components/hooks'
import { source } from '../data/source'
import type { ContactChannel, JourneyStep, Lead } from '../data/types'
import { CHANNEL_LABELS } from '../data/types'

export type LeadFilter = 'koud' | 'warm' | 'afgesloten'

const stepOf = (l: Lead): JourneyStep =>
  l.state === 'gekwalificeerd' ? 'voorstelling' : l.state === 'gestopt' ? 'gestopt' : l.temperature === 'koud' ? 'koude-lead' : 'warme-lead'

const person = (l: Lead) => [l.firstName, l.lastName].filter(Boolean).join(' ')

export function Leads({
  initialFilter,
  onChanged,
  onGoToProposals,
}: {
  initialFilter: LeadFilter
  onChanged: (msg: string) => void
  onGoToProposals: () => void
}) {
  const { data, error, loading, reload } = useLoad(() => source.getLeads())
  const [filter, setFilter] = useState<LeadFilter>(initialFilter)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()

  const rows = useMemo(
    () =>
      (data ?? []).filter((l) => {
        const inFilter = filter === 'afgesloten' ? l.state !== 'open' : l.state === 'open' && l.temperature === filter
        const text = `${l.companyName ?? ''} ${l.subject} ${person(l)}`.toLowerCase()
        return inFilter && (!query || text.includes(query.toLowerCase()))
      }),
    [data, filter, query],
  )
  const selected = data?.find((l) => l.id === selectedId)

  return (
    <>
      <PageHead title="Leads" sub="Koude leads contacteren, een afspraak maken, en warme leads een voorstelling geven." />

      <div className="toolbar">
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            ['koud', 'Koude leads'],
            ['warm', 'Warme leads'],
            ['afgesloten', 'Afgesloten'],
          ]}
        />
        <input className="search" placeholder="Zoek op bedrijf of persoon" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <ErrorBox message={error} />

      <div className={selected ? 'split' : ''}>
        <div className="card">
          {loading && !data ? (
            <Empty>Laden…</Empty>
          ) : rows.length === 0 ? (
            <Empty>Geen leads in deze lijst.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Bedrijf</th>
                  <th>Contactpersoon</th>
                  <th>Stap</th>
                  <th>Status</th>
                  <th>Aangemaakt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className={`row ${l.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(l.id)}>
                    <td>
                      <b>{l.companyName || l.subject}</b>
                    </td>
                    <td className="muted">{orDash(person(l))}</td>
                    <td>
                      <StepBadge step={stepOf(l)} />
                    </td>
                    <td className="muted">{l.state === 'open' ? (l.contacted ? 'Contact opgenomen' : 'Nieuw') : '—'}</td>
                    <td className="muted nowrap">{day(l.createdOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <LeadPanel
            key={selected.id}
            lead={selected}
            onClose={() => setSelectedId(undefined)}
            onGoToProposals={onGoToProposals}
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

function LeadPanel({
  lead: l,
  onClose,
  onChanged,
  onGoToProposals,
}: {
  lead: Lead
  onClose: () => void
  onChanged: (msg: string) => void
  onGoToProposals: () => void
}) {
  const notes = useLoad(() => source.getNotes('lead', l.id))
  const action = useAction()
  const [channel, setChannel] = useState<ContactChannel>('telefoon')
  const [contactNote, setContactNote] = useState('')
  const [meetingNote, setMeetingNote] = useState('')
  const [proposalName, setProposalName] = useState(`Voorstelling ${l.companyName || l.subject}`)
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const name = l.companyName || l.subject
  const step = stepOf(l)

  const done = (msg: string) => {
    notes.reload()
    onChanged(msg)
  }

  return (
    <aside className="card panel" aria-label={name}>
      <div className="panel-head">
        <div style={{ flex: 1 }}>
          <h2>{name}</h2>
          <StepBadge step={step} />
          <Stepper step={step} />
        </div>
        <button className="close" onClick={onClose} aria-label="Sluiten">
          ×
        </button>
      </div>

      <div className="panel-section">
        <h3>Contactpersoon</h3>
        <dl className="facts">
          <dt>Naam</dt>
          <dd>{orDash(person(l))}</dd>
          <dt>E-mail</dt>
          <dd>{l.email ? <a href={`mailto:${l.email}`}>{l.email}</a> : '—'}</dd>
          <dt>Telefoon</dt>
          <dd>{l.phone ? <a href={`tel:${l.phone}`}>{l.phone}</a> : '—'}</dd>
        </dl>
      </div>

      <ErrorBox message={action.error} />

      {l.state === 'open' && l.temperature === 'koud' && (
        <>
          <div className="panel-section">
            <h3>Contact opnemen</h3>
            <div className="choices">
              {(Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((c) => (
                <button key={c} className={`choice ${channel === c ? 'active' : ''}`} onClick={() => setChannel(c)}>
                  {CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
            <Field label="Notitie">
              <textarea value={contactNote} onChange={(e) => setContactNote(e.target.value)} placeholder="Wat werd er gezegd?" />
            </Field>
            <button
              className="btn primary"
              disabled={action.busy}
              onClick={() =>
                action.run(async () => {
                  await source.logContact(l.id, channel, contactNote)
                  setContactNote('')
                  done(`Contact via ${CHANNEL_LABELS[channel].toLowerCase()} vastgelegd.`)
                })
              }
            >
              Contact vastleggen
            </button>
          </div>

          <div className="panel-section">
            <h3>Afspraak?</h3>
            <Field label="Notitie">
              <textarea value={meetingNote} onChange={(e) => setMeetingNote(e.target.value)} placeholder="Datum, plaats, of waarom niet" />
            </Field>
            <div className="btn-row">
              <button
                className="btn yes"
                disabled={action.busy || !l.contacted}
                onClick={() =>
                  action.run(async () => {
                    await source.recordMeeting(l.id, true, meetingNote)
                    done(`${name} is nu een warme lead.`)
                  })
                }
              >
                Ja → warme lead
              </button>
              <button
                className="btn no"
                disabled={action.busy || !l.contacted}
                onClick={() =>
                  action.run(async () => {
                    await source.recordMeeting(l.id, false, meetingNote)
                    done(`De klantreis met ${name} is gestopt.`)
                  })
                }
              >
                Nee → stop
              </button>
            </div>
            {!l.contacted && <p className="hint">Leg eerst het contact vast.</p>}
          </div>
        </>
      )}

      {l.state === 'open' && l.temperature === 'warm' && (
        <div className="panel-section">
          <h3>Voorstelling</h3>
          <Field label="Naam van de voorstelling">
            <input value={proposalName} onChange={(e) => setProposalName(e.target.value)} />
          </Field>
          <Field label="Geschatte waarde (EUR)">
            <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field label="Wat stellen we voor?">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <button
            className="btn primary"
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                await source.startProposal({ leadId: l.id, name: proposalName, estimatedValue: parseNumber(value), description })
                onChanged(`Voorstelling voor ${name} gestart.`)
                onGoToProposals()
              })
            }
          >
            Voorstelling starten
          </button>
          <p className="hint">De lead wordt gekwalificeerd en verschijnt bij Voorstellingen.</p>
        </div>
      )}

      {l.state === 'gekwalificeerd' && (
        <div className="panel-section">
          <button className="btn" onClick={onGoToProposals}>
            Naar de voorstellingen
          </button>
        </div>
      )}

      <div className="panel-section">
        <h3>Geschiedenis</h3>
        <ErrorBox message={notes.error} />
        <Notes notes={notes.data} />
      </div>
    </aside>
  )
}
