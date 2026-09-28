/**
 * The dashboard's charts: plain SVG, no chart library (nothing extra to load in the Power Apps
 * host). Specs from the data-viz method: bars at most 24px thick with a 4px rounded data-end,
 * square at the baseline; hairline recessive grid; text in ink, never in the series colour; a
 * hover tooltip on every mark; and a table view for every chart.
 */

import { useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'

interface Tip {
  x: number
  y: number
  text: string
}

/** A tooltip that follows the pointer inside a chart container. */
function useTip() {
  const [tip, setTip] = useState<Tip>()
  const show = (e: ReactMouseEvent, text: string) => {
    const box = (e.currentTarget as Element).closest('.chart')!.getBoundingClientRect()
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, text })
  }
  const hide = () => setTip(undefined)
  const node = tip ? (
    <div className="tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
      {tip.text}
    </div>
  ) : null
  return { show, hide, node }
}

/** A column with a 4px rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

/** A bar growing right, square at the baseline (left), rounded at the data-end (right). */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w, h / 2)
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`
}

function niceMax(v: number) {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * pow).find((s) => s * 4 >= v) ?? pow * 10
  return step * 4
}

export interface ColumnDatum {
  label: string
  value: number
  detail: string
  /** e.g. the current, still-running week: drawn lighter. */
  partial?: boolean
}

export function ColumnChart({ data, title, note }: { data: ColumnDatum[]; title: string; note?: ReactNode }) {
  const tip = useTip()
  const W = 560
  const H = 200
  const pad = { l: 34, r: 8, t: 12, b: 26 }
  const max = niceMax(Math.max(1, ...data.map((d) => d.value)))
  const band = (W - pad.l - pad.r) / data.length
  const bw = Math.min(24, band * 0.6)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max]
  const every = data.length > 8 ? 2 : 1

  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} className="tick" textAnchor="end">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * band + (band - bw) / 2
          const h = y(0) - y(d.value)
          return (
            <g key={d.label + i}>
              {/* The hit target is the whole band, taller than the mark. */}
              <rect
                x={pad.l + i * band}
                y={pad.t}
                width={band}
                height={H - pad.t - pad.b}
                fill="transparent"
                onMouseMove={(e) => tip.show(e, d.detail)}
                onMouseLeave={tip.hide}
              />
              {d.value > 0 && <path d={columnPath(x, y(d.value), bw, h)} className={d.partial ? 'mark partial' : 'mark'} pointerEvents="none" />}
              {i % every === (data.length - 1) % every && (
                <text x={x + bw / 2} y={H - 8} className="tick" textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {tip.node}
      {note && <p className="hint">{note}</p>}
      <details className="as-table">
        <summary>Als tabel</summary>
        <table className="table">
          <tbody>
            {data.map((d, i) => (
              <tr key={d.label + i}>
                <td>{d.label}</td>
                <td className="num">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}

export interface FunnelDatum {
  label: string
  count: number
  fromPrevious?: number
}

/** Horizontal bars, one hue, value at the tip and the step-to-step share beside it. */
export function FunnelChart({ data, title }: { data: FunnelDatum[]; title: string }) {
  const tip = useTip()
  const W = 560
  const row = 34
  const labelW = 110
  const valueW = 110
  const H = data.length * row + 4
  const max = Math.max(1, data[0]?.count ?? 1)
  const scale = (v: number) => ((W - labelW - valueW) * v) / max
  const pct = (x?: number) => (x == null ? '' : `${Math.round(x * 100)}%`)

  return (
    <figure className="chart">
      <figcaption className="chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {data.map((d, i) => {
          const y = i * row + 5
          const w = scale(d.count)
          const detail = `${d.label}: ${d.count}${d.fromPrevious != null ? ` (${pct(d.fromPrevious)} van de stap ervoor)` : ''}`
          return (
            <g key={d.label} onMouseMove={(e) => tip.show(e, detail)} onMouseLeave={tip.hide}>
              <rect x={0} y={y - 5} width={W} height={row} fill="transparent" />
              <text x={0} y={y + 16} className="label">
                {d.label}
              </text>
              <rect x={labelW} y={y + 1} width={W - labelW - valueW} height={22} className="track" rx={4} />
              {w > 0 && <path d={barPath(labelW, y + 1, Math.max(w, 2), 22)} className="mark" />}
              <text x={labelW + Math.max(w, 2) + 8} y={y + 16} className="value">
                {d.count}
              </text>
              {d.fromPrevious != null && (
                <text x={W} y={y + 16} className="tick" textAnchor="end">
                  {pct(d.fromPrevious)} door
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {tip.node}
    </figure>
  )
}

/** A thin meter for a rate: the fill on a lighter step of the same hue. */
export function Meter({ value }: { value?: number }) {
  return (
    <span className="meter" aria-hidden="true">
      <span style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
    </span>
  )
}
