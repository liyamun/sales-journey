/**
 * Phase 1 · Prospect — Analyseren and Valideren.
 */

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { Dialog, Empty, ErrorBox, Field, PageHead, StepBadge, Stepper, Tabs } from '../components/ui'
import { day, money, orDash, parseNumber } from '../components/format'
import { useAction, useLoad } from '../components/hooks'
import { evaluate, isGoodProspect, whyNot } from '../data/criteria'
import { source } from '../data/source'
import type { ContactPerson, JourneyStep, NewProspect, Prospect } from '../data/types'

type Filter = 'te-analyseren' | 'onderweg' | 'gestopt' | 'alle'

const IN_FILTER: Record<Filter, (s: JourneyStep) => boolean> = {
  'te-analyseren': (s) => s === 'te-analyseren',
  onderweg: (s) => s === 'koude-lead' || s === 'warme-lead' || s === 'voorstelling',
  gestopt: (s) => s === 'gestopt' || s === 'niet-geschikt',
  alle: () => true,
}

export function Prospects({ onChanged, onGoToLeads }: { onChanged: (msg: string) => void; onGoToLeads: () => void }) {
  const { data, error, loading, reload } = useLoad(() => source.getProspects())
  const [filter, setFilter] = useState<Filter>('te-analyseren')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [creating, setCreating] = useState(false)

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (p) => IN_FILTER[filter](p.step) && (!query || `${p.name} ${p.city ?? ''}`.toLowerCase().includes(query.toLowerCase())),
      ),
    [data, filter, query],
  )
  const selected = data?.find((p) => p.id === selectedId)

  return (
    <>
      <PageHead title="Prospects" sub="Bedrijven die we bekijken. Analyseer en valideer: pas dan worden ze een lead.">
        <button className="btn primary" onClick={() => setCreating(true)}>
          Nieuwe prospect
        </button>
      </PageHead>

      <div className="toolbar">
        <Tabs
          value={filter}
          onChange={setFilter}
          options={[
            ['te-analyseren', 'Te analyseren'],
            ['onderweg', 'In de klantreis'],
            ['gestopt', 'Gestopt'],
            ['alle', 'Alle'],
          ]}
        />
        <input className="search" placeholder="Zoek op naam of stad" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <ErrorBox message={error} />

      <div className={selected ? 'split' : ''}>
        <div className="card">
          {loading && !data ? (
            <Empty>Laden…</Empty>
          ) : rows.length === 0 ? (
            <Empty>Geen prospects in deze lijst.</Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Bedrijf</th>
                  <th>Stad</th>
                  <th className="num">Werknemers</th>
                  <th className="num">Jaaromzet</th>
                  <th>Stap</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className={`row ${p.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(p.id)}>
                    <td>
                      <b>{p.name}</b>
                    </td>
                    <td className="muted">{orDash(p.city)}</td>
                    <td className="num">{orDash(p.employees)}</td>
                    <td className="num">{money(p.revenue)}</td>
                    <td>
                      <StepBadge step={p.step} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selected && (
          <ProspectPanel
            key={selected.id}
            prospect={selected}
            onClose={() => setSelectedId(undefined)}
            onGoToLeads={onGoToLeads}
            onChanged={(msg) => {
              reload()
              onChanged(msg)
            }}
          />
        )}
      </div>

      {creating && (
        <NewProspectDialog
          onClose={() => setCreating(false)}
          onCreated={(id, name) => {
            setCreating(false)
            setFilter('te-analyseren')
            setSelectedId(id)
            reload()
            onChanged(`${name} is toegevoegd als prospect.`)
          }}
        />
      )}
    </>
  )
}

function ProspectPanel({
  prospect: p,
  onClose,
  onChanged,
  onGoToLeads,
}: {
  prospect: Prospect
  onClose: () => void
  onChanged: (msg: string) => void
  onGoToLeads: () => void
}) {
  const [makesProducts, setMakesProducts] = useState<boolean>()
  const [employees, setEmployees] = useState(p.employees?.toString() ?? '')
  const [revenue, setRevenue] = useState(p.revenue?.toString() ?? '')
  const [contact, setContact] = useState<ContactPerson>({})
  const action = useAction()

  // Evaluate on what is typed, so the checklist reacts before saving.
  const draft = { ...p, employees: parseNumber(employees), revenue: parseNumber(revenue) }
  const criteria = evaluate(draft, makesProducts)
  const ok = isGoodProspect(criteria)
  const dirty = draft.employees !== p.employees || draft.revenue !== p.revenue
  const canAnalyse = p.step === 'te-analyseren'

  const validate = () =>
    action.run(async () => {
      if (dirty) await source.updateProspect(p.id, { employees: draft.employees, revenue: draft.revenue })
      await source.validateProspect({ prospectId: p.id, makesProducts: makesProducts === true, contact })
      onChanged(`${p.name} is nu een koude lead.`)
    })

  const reject = () =>
    action.run(async () => {
      if (dirty) await source.updateProspect(p.id, { employees: draft.employees, revenue: draft.revenue })
      await source.rejectProspect(p.id)
      onChanged(`${p.name} is als niet geschikt gemarkeerd.`)
    })

  const save = () =>
    action.run(async () => {
      await source.updateProspect(p.id, { employees: draft.employees, revenue: draft.revenue })
      onChanged('Gegevens bewaard.')
    })

  return (
    <aside className="card panel" aria-label={p.name}>
      <div className="panel-head">
        <div style={{ flex: 1 }}>
          <h2>{p.name}</h2>
          <StepBadge step={p.step} />
          <Stepper step={p.step} />
        </div>
        <button className="close" onClick={onClose} aria-label="Sluiten">
          ×
        </button>
      </div>

      <div className="panel-section">
        <h3>Gegevens</h3>
        <dl className="facts">
          <dt>Stad</dt>
          <dd>{orDash(p.city)}</dd>
          <dt>Sector</dt>
          <dd>{orDash(p.industry)}</dd>
          <dt>Telefoon</dt>
          <dd>{orDash(p.phone)}</dd>
          <dt>E-mail</dt>
          <dd>{orDash(p.email)}</dd>
          <dt>Website</dt>
          <dd>{orDash(p.website)}</dd>
          <dt>Toegevoegd</dt>
          <dd>{day(p.createdOn)}</dd>
        </dl>
      </div>

      {canAnalyse ? (
        <>
          <div className="panel-section">
            <h3>Analyseren</h3>
            <div className="row2">
              <Field label="Werknemers">
                <input inputMode="numeric" value={employees} onChange={(e) => setEmployees(e.target.value)} />
              </Field>
              <Field label="Jaaromzet (EUR)">
                <input inputMode="numeric" value={revenue} onChange={(e) => setRevenue(e.target.value)} />
              </Field>
            </div>
            <Field label="Maakt dit bedrijf producten?">
              <div className="choices">
                <button className={`choice ${makesProducts === true ? 'active' : ''}`} onClick={() => setMakesProducts(true)}>
                  Ja
                </button>
                <button className={`choice ${makesProducts === false ? 'active' : ''}`} onClick={() => setMakesProducts(false)}>
                  Nee
                </button>
              </div>
            </Field>
            <ul className="criteria">
              {criteria.map((c) => (
                <li key={c.key} className="criterion">
                  <span className={`mark ${c.result}`}>{c.result === 'ok' ? '✓' : c.result === 'niet-ok' ? '✕' : '?'}</span>
                  <div>
                    {c.label}
                    {c.required && <span className="must">verplicht</span>}
                    <small>{c.detail}</small>
                  </div>
                </li>
              ))}
            </ul>
            {dirty && (
              <p className="hint">
                Gewijzigde cijfers worden bewaard bij valideren.{' '}
                <button className="btn" style={{ padding: '2px 8px' }} onClick={save} disabled={action.busy}>
                  Nu bewaren
                </button>
              </p>
            )}
          </div>

          <div className="panel-section">
            <h3>Contactpersoon (optioneel)</h3>
            <div className="row2">
              <Field label="Voornaam">
                <input value={contact.firstName ?? ''} onChange={(e) => setContact({ ...contact, firstName: e.target.value })} />
              </Field>
              <Field label="Achternaam">
                <input value={contact.lastName ?? ''} onChange={(e) => setContact({ ...contact, lastName: e.target.value })} />
              </Field>
            </div>
            <div className="row2">
              <Field label="E-mail">
                <input type="email" value={contact.email ?? ''} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </Field>
              <Field label="Telefoon">
                <input value={contact.phone ?? ''} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </Field>
            </div>
          </div>

          <div className="panel-section">
            <h3>Valideren</h3>
            <ErrorBox message={action.error} />
            <div className="btn-row">
              <button className="btn primary" disabled={!ok || action.busy} onClick={validate}>
                Valideren → koude lead
              </button>
              <button className="btn no" disabled={action.busy} onClick={reject}>
                Niet geschikt
              </button>
            </div>
            <p className="hint">{ok ? 'Goede prospect: genoeg geld, en minstens 2 van de 3 criteria.' : whyNot(criteria)}</p>
          </div>
        </>
      ) : (
        <div className="panel-section">
          <h3>Klantreis</h3>
          {p.step === 'niet-geschikt' ? (
            <p className="hint">Dit bedrijf viel af bij de analyse.</p>
          ) : p.step === 'gestopt' ? (
            <p className="hint">De klantreis is gestopt: geen afspraak of geen akkoord.</p>
          ) : (
            <button className="btn" onClick={onGoToLeads}>
              Naar de leads
            </button>
          )}
        </div>
      )}
    </aside>
  )
}

function NewProspectDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const [form, setForm] = useState<Record<keyof NewProspect, string>>({
    name: '', employees: '', revenue: '', city: '', phone: '', email: '', website: '',
  })
  const action = useAction()
  const set = (k: keyof NewProspect) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void action.run(async () => {
      const id = await source.createProspect({
        name: form.name,
        employees: parseNumber(form.employees),
        revenue: parseNumber(form.revenue),
        city: form.city || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        website: form.website || undefined,
      })
      onCreated(id, form.name.trim())
    })
  }

  return (
    <Dialog title="Nieuwe prospect" onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Bedrijfsnaam *">
          <input autoFocus required value={form.name} onChange={set('name')} />
        </Field>
        <div className="row2">
          <Field label="Werknemers">
            <input inputMode="numeric" value={form.employees} onChange={set('employees')} />
          </Field>
          <Field label="Jaaromzet (EUR)">
            <input inputMode="numeric" value={form.revenue} onChange={set('revenue')} />
          </Field>
        </div>
        <div className="row2">
          <Field label="Stad">
            <input value={form.city} onChange={set('city')} />
          </Field>
          <Field label="Telefoon">
            <input value={form.phone} onChange={set('phone')} />
          </Field>
        </div>
        <div className="row2">
          <Field label="E-mail">
            <input type="email" value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Website">
            <input value={form.website} onChange={set('website')} />
          </Field>
        </div>
        <ErrorBox message={action.error} />
        <div className="btn-row">
          <button type="button" className="btn" onClick={onClose}>
            Annuleren
          </button>
          <button type="submit" className="btn primary" disabled={action.busy || !form.name.trim()}>
            Toevoegen
          </button>
        </div>
      </form>
    </Dialog>
  )
}
