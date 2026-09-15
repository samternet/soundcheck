import React from 'react'

export function ActivityRadar({
  values,
  labels,
  color,
}: {
  values: number[]
  labels: string[]
  color: string
}) {
  const n = values.length
  // maxR is kept well inside the label ring (rather than close to it) so the plotted
  // shape and the weekday labels never crowd each other regardless of chart size.
  const cx = 180,
    cy = 180,
    maxR = 90,
    labelR = 150
  const pt = (i: number, val: number, r: number = maxR) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2
    const rr = r * (Math.max(0, Math.min(100, val)) / 100)
    return [cx + Math.cos(angle) * rr, cy + Math.sin(angle) * rr] as const
  }
  const dataPts = values.map((v, i) => pt(i, v))
  return (
    <svg
      viewBox="0 0 360 360"
      className="activity-radar-chart"
      role="img"
      aria-label="Radar chart of listening intensity"
    >
      {[25, 50, 75, 100].map(ring => (
        <polygon
          key={ring}
          points={Array.from({ length: n }, (_, i) => pt(i, ring).join(',')).join(' ')}
          fill="none"
          className="chart-grid"
          strokeWidth="1"
        />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const p = pt(i, 100)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p[0]}
            y2={p[1]}
            className="chart-spoke"
            strokeWidth="1"
          />
        )
      })}
      <polygon
        points={dataPts.map(p => p.join(',')).join(' ')}
        fill={color}
        fillOpacity=".22"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {dataPts.map((p, i) => (
        <circle
          key={i}
          cx={p[0]}
          cy={p[1]}
          r="2.6"
          className="chart-dot"
          stroke={color}
          strokeWidth="1.6"
        />
      ))}
      {labels.map((lab, i) => {
        if (!lab) return null
        const p = pt(i, 100, labelR)
        const dx = p[0] - cx
        const anchor = dx > 8 ? 'start' : dx < -8 ? 'end' : 'middle'
        return (
          <text
            key={i}
            x={p[0]}
            y={p[1]}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="activity-radar-label"
          >
            {lab}
          </text>
        )
      })}
    </svg>
  )
}
