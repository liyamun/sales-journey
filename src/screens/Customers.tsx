/**
 * Phase 3 · Klant — Fase 0 (luisteren). The later phases are still "..." on the Miro board.
 */

import { Empty, ErrorBox, PageHead } from '../components/ui'
import { day, orDash } from '../components/format'
import { useLoad } from '../components/hooks'
import { source } from '../data/source'
import { PHASE_LABELS } from '../data/types'

export function Customers() {
  const { data, error, loading } = useLoad(() => source.getCustomers())

  return (
    <>
      <PageHead title="Klanten" sub="Akkoord gekregen. Iedere klant start in Fase 0: we luisteren. De volgende fases volgen nog." />
      <ErrorBox message={error} />
      <div className="card">
        {loading && !data ? (
          <Empty>Laden…</Empty>
        ) : !data?.length ? (
          <Empty>Nog geen klanten. Een voorstelling met akkoord maakt er een.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Klant</th>
                <th>Stad</th>
                <th>Telefoon</th>
                <th>E-mail</th>
                <th>Fase</th>
                <th>Klant sinds</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                  </td>
                  <td className="muted">{orDash(c.city)}</td>
                  <td className="muted">{orDash(c.phone)}</td>
                  <td className="muted">{orDash(c.email)}</td>
                  <td>
                    <span className="badge klant">{PHASE_LABELS[c.phase]}</span>
                  </td>
                  <td className="muted nowrap">{day(c.since)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
