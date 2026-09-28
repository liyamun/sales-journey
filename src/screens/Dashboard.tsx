/**
 * Dashboard — how the Klantreis is going, and what could be better.
 *
 * Everything is computed in `data/analytics.ts` from the journey events; this screen only draws.
 * The period filter sits in one row above everything and drives every tile and chart, except the
 * two trend charts (always the last 12 weeks / 6 months, so their shape stays comparable) and the
 * follow-up list (always "now").
 */

import { useMemo, useState } from 'react'
import { ColumnChart, FunnelChart, Meter } from '../components/charts'
import { useLoad } from '../components/hooks'
import { Empty, ErrorBox, PageHead, Tabs } from '../components/ui'
import { PERIODS, computeDashboard, type Kpi, type PeriodId } from '../data/analytics'
import { source } from '../data/source'
import type { ScreenId } from '../components/AppShell'
import type { LeadFilter } from './Leads'

const eur = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 })

function formatKpi(k: Kpi, v: number | undefined): string {
  if (v == null || Number.isNaN(v)) return '–'
  switch (k.format) {
    case 'percent':
      return `${Math.round(v * 100)}%`
    case 'money':
      return eur.format(v)
    case 'days':
      return `${Math.round(v)} d`
    default:
      return v.toLocaleString('nl-BE')
  }
}

function Delta({ k, prevLabel }: { k: Kpi; prevLabel: string }) {
  if (k.previous == null || Number.isNaN(k.previous) || Number.isNaN(k.value)) return <span className="delta muted">geen vergelijking</span>
  const diff = k.value - k.previous
  if (Math.abs(diff) < 1e-9) return <span className="delta muted">= {prevLabel}</span>
  const good = diff > 0 === k.upIsGood
  const shown =
    k.format === 'percent'
      ? `${Math.abs(Math.round(diff * 100))} ptn`
      : k.format === 'money'
        ? eur.format(Math.abs(diff))
        : k.format === 'days'
          ? `${Math.abs(Math.round(diff))} d`
          : Math.abs(diff).toLocaleString('nl-BE')
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      <span aria-hidden="true">{diff > 0 ? '▲' : '▼'}</span> {shown} <span className="muted">vs {prevLabel}</span>
    </span>
  )
}

const pct = (x?: number) => (x == null ? '–' : `${Math.round(x * 100)}%`)

export function Dashboard({ onOpen }: { onOpen: (s: ScreenId, f?: LeadFilter) => void }) {
  const { data, error, loading } = useLoad(() => source.getDashboardData())
  const [period, setPeriod] = useState<PeriodId>('vorige-maand')
  const dash = useMemo(() => (data ? computeDashboard(data, period) : undefined), [data, period])
  const prevLabel = { 'deze-maand': 'vorige maand', 'vorige-maand': 'maand ervoor', '30d': '30 d ervoor', '90d': '90 d ervoor', 'dit-jaar': 'vorig jaar' }[period]

  return (
    <>
      <PageHead title="Dashboard" sub="Hoe loopt de klantreis, en wat kan beter?" />
      <div className="toolbar">
        <Tabs value={period} onChange={setPeriod} options={PERIODS} />
      </div>
      <ErrorBox message={error} />
      {loading && !dash ? (
        <div className="card">
          <Empty>Laden…</Empty>
        </div>
      ) : dash ? (
        <>
          <div className="kpis">
            {dash.kpis.map((k) => (
              <div key={k.key} className="card kpi" title={k.hint}>
                <div className="l">{k.label}</div>
                <div className="v">{formatKpi(k, k.value)}</div>
                <Delta k={k} prevLabel={prevLabel} />
              </div>
            ))}
          </div>

          <div className="dash-grid">
            <section className="card card-pad">
              <h2 className="section-title">Wat kan beter</h2>
              <ul className="insights">
                {dash.insights.map((i, n) => (
                  <li key={n} className={`insight ${i.tone}`}>
                    <span className="insight-mark" aria-hidden="true">
                      {i.tone === 'good' ? '✓' : i.tone === 'attention' ? '!' : 'i'}
                    </span>
                    <span>{i.text}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card card-pad">
              <FunnelChart title="Van gevalideerd tot klant" data={dash.funnel} />
              <p className="hint">De leads gevalideerd in deze periode, en hoe ver elk tot nu toe kwam. Recente leads zijn nog onderweg.</p>
            </section>
          </div>

          <section className="card card-pad" style={{ marginTop: 16 }}>
            <h2 className="section-title">Welk kanaal werkt het best?</h2>
            <p className="hint" style={{ marginTop: -4, marginBottom: 10 }}>
              Leads per kanaal van het eerste contact in deze periode. Een kanaal met minder dan 3 leads wordt niet gerangschikt.
            </p>
            <table className="table channels">
              <thead>
                <tr>
                  <th>Kanaal</th>
                  <th className="num">Gecontacteerd</th>
                  <th>Reageerde</th>
                  <th>Afspraak</th>
                  <th>Werd klant</th>
                </tr>
              </thead>
              <tbody>
                {dash.channels.map((c) => (
                  <tr key={c.channel}>
                    <td>
                      <span className={`swatch ch-${c.channel}`} aria-hidden="true" />
                      <b>{c.label}</b>
                      {dash.bestChannel === c.channel && <span className="chip-best">Beste</span>}
                    </td>
                    <td className="num">{c.contacted}</td>
                    <td>
                      <span className="rate">
                        <Meter value={c.replyRate} /> {pct(c.replyRate)}
                      </span>
                    </td>
                    <td>
                      <span className="rate">
                        <Meter value={c.meetingRate} /> {pct(c.meetingRate)}
                      </span>
                    </td>
                    <td>
                      <span className="rate">
                        <Meter value={c.customerRate} /> {pct(c.customerRate)}
                        <span className="muted">({c.customers})</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="dash-grid even" style={{ marginTop: 16 }}>
            <section className="card card-pad">
              <ColumnChart
                title="Contacten per week"
                data={dash.contactsPerWeek.map((b, i, all) => ({ ...b, partial: i === all.length - 1 }))}
                note="Laatste 12 weken. De lichte kolom is de lopende week."
              />
            </section>
            <section className="card card-pad">
              <ColumnChart
                title="Nieuwe klanten per maand"
                data={dash.customersPerMonth.map((b, i, all) => ({ ...b, partial: i === all.length - 1 }))}
                note="Laatste 6 maanden. De lichte kolom is de lopende maand."
              />
            </section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h2 className="section-title">Opvolgen</h2>
              <p className="hint" style={{ marginTop: -4 }}>Wie wacht er nu op ons? Los van de gekozen periode.</p>
            </div>
            {dash.followUps.length === 0 ? (
              <Empty>Niemand wacht. Goed bezig.</Empty>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Bedrijf</th>
                    <th>Wat</th>
                    <th className="num">Wacht sinds</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {dash.followUps.slice(0, 12).map((f) => (
                    <tr key={(f.leadId ?? f.proposalId) + f.kind}>
                      <td>
                        <b>{f.company}</b>
                      </td>
                      <td className="muted">{f.advice}</td>
                      <td className="num">{f.days} dagen</td>
                      <td className="num">
                        <button
                          className="btn"
                          style={{ padding: '4px 10px' }}
                          onClick={() =>
                            f.kind === 'voorstelling-loopt'
                              ? onOpen('proposals')
                              : onOpen('leads', f.kind === 'geen-voorstelling' ? 'warm' : 'koud')
                          }
                        >
                          Openen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {dash.followUps.length > 12 && <p className="hint card-pad">En nog {dash.followUps.length - 12} andere.</p>}
          </section>
        </>
      ) : null}
    </>
  )
}
