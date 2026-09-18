import React from 'react'

export function HourlyPolarChart({
  values,
  color,
  onHourClick,
}: {
  values: number[]
  color: string
  onHourClick?: (hour: number) => void
}) {
  const n = values.length
  // outerMaxR leaves a wide margin to the viewBox edge (rather than crowding it) so
  // the hour labels — "6 AM"/"6 PM" reach farthest, being anchored start/end — always
  // have room to render fully however large or small the chart is drawn.
  const cx = 190,
    cy = 190,
    innerR = 46,
    outerMaxR = 125,
    gapDeg = 2
  const stepDeg = 360 / n
  const max = Math.max(...values, 1)
  const toRad = (a: number) => ((a - 90) * Math.PI) / 180
  const p = (r: number, a: number) =>
    [cx + r * Math.cos(toRad(a)), cy + r * Math.sin(toRad(a))] as const
  const wedgePath = (iR: number, oR: number, startA: number, endA: number) => {
    const [x1, y1] = p(oR, startA),
      [x2, y2] = p(oR, endA),
      [x3, y3] = p(iR, endA),
      [x4, y4] = p(iR, startA)
    return `M ${x1} ${y1} A ${oR} ${oR} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${iR} ${iR} 0 0 0 ${x4} ${y4} Z`
  }
  const labelDefs: [number, string][] = [
    [0, '12 AM'],
    [3, '3 AM'],
    [6, '6 AM'],
    [9, '9 AM'],
    [12, '12 PM'],
    [15, '3 PM'],
    [18, '6 PM'],
    [21, '9 PM'],
  ]
  return (
    <svg
      viewBox="0 0 380 380"
      className="activity-polar-chart"
      role="img"
      aria-label="Polar bar chart of listening intensity by hour of day"
    >
      {values.map((_, i) => {
        const startA = i * stepDeg + gapDeg / 2,
          endA = (i + 1) * stepDeg - gapDeg / 2
        return (
          <path
            key={`bg${i}`}
            d={wedgePath(innerR, outerMaxR, startA, endA)}
            className="chart-wedge"
          />
        )
      })}
      {values.map((v, i) => {
        if (v <= 0) return null
        const startA = i * stepDeg + gapDeg / 2,
          endA = (i + 1) * stepDeg - gapDeg / 2
        const r = innerR + (outerMaxR - innerR) * (v / max)
        return <path key={`fg${i}`} d={wedgePath(innerR, r, startA, endA)} fill={color} />
      })}
      {onHourClick &&
        values.map((_, i) => {
          const startA = i * stepDeg + gapDeg / 2,
            endA = (i + 1) * stepDeg - gapDeg / 2
          return (
            <path
              key={`hit${i}`}
              d={wedgePath(innerR, outerMaxR, startA, endA)}
              className="chart-wedge-hit"
              role="button"
              tabIndex={0}
              aria-label={`Songs played at ${i % 12 === 0 ? 12 : i % 12}:00 ${i < 12 ? 'AM' : 'PM'}`}
              onClick={() => onHourClick(i)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onHourClick(i)
                }
              }}
            />
          )
        })}
      {labelDefs.map(([h, lab]) => {
        const p2 = p(outerMaxR + 28, h * stepDeg)
        const dx = p2[0] - cx
        const anchor = dx > 8 ? 'start' : dx < -8 ? 'end' : 'middle'
        return (
          <text
            key={h}
            x={p2[0]}
            y={p2[1]}
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
