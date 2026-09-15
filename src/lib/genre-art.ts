import { genreArtworkFamilies } from './constants'

function genreArtSlug(raw: string) {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
  for (const [needle, slug] of genreArtworkFamilies)
    if (value === needle || value.includes(needle)) return slug
  return 'default'
}
export function genreArtPath(raw: string) {
  return `/genre-art/${genreArtSlug(raw)}.webp`
}
export function genreBucketValues(hourly: number[] | undefined) {
  const values = Array.isArray(hourly) ? hourly : Array(24).fill(0)
  return Array.from({ length: 6 }, (_, b) =>
    values.slice(b * 4, b * 4 + 4).reduce((a, x) => a + Number(x || 0), 0),
  )
}

export function soundProfilePoints(values: number[]) {
  const cx = 120,
    cy = 92,
    rx = 82,
    ry = 64
  return values
    .map((value, i) => {
      const angle = ((-90 + i * 90) * Math.PI) / 180
      const r = Math.max(0, Math.min(100, Number(value || 0))) / 100
      return `${(cx + Math.cos(angle) * rx * r).toFixed(1)},${(cy + Math.sin(angle) * ry * r).toFixed(1)}`
    })
    .join(' ')
}
