export const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export const monthFullNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/**
 * Weekday labels, Monday-first to match the server's `weekday` array (see the
 * %w shift in db.ts). Previously declared inline inside ActivityPage.
 */
export const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const weekdayFullNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

/**
 * The day is reported in six four-hour buckets. `hourLabels`, `hourRanges` and
 * `hourAxisLabels` are read side by side by index in four different components,
 * so they are derived from this one list rather than maintained as three
 * separate arrays that could fall out of alignment.
 */
export const HOUR_BUCKETS = [
  { label: 'Late night', range: '12 AM – 4 AM', axisLabel: '12am' },
  { label: 'Early morning', range: '4 AM – 8 AM', axisLabel: '4am' },
  { label: 'Morning', range: '8 AM – 12 PM', axisLabel: '8am' },
  { label: 'Afternoon', range: '12 PM – 4 PM', axisLabel: '12pm' },
  { label: 'Evening', range: '4 PM – 8 PM', axisLabel: '4pm' },
  { label: 'Night', range: '8 PM – 12 AM', axisLabel: '8pm' },
] as const

/** Hours covered by each bucket above. */
export const HOURS_PER_BUCKET = 24 / HOUR_BUCKETS.length

export const hourLabels = HOUR_BUCKETS.map(b => b.label)
export const hourRanges = HOUR_BUCKETS.map(b => b.range)
export const hourAxisLabels = HOUR_BUCKETS.map(b => b.axisLabel)

export const genrePalette = [
  '#f18b6d',
  '#a45fdf',
  '#5b8fdc',
  '#79ad8a',
  '#e7bd63',
  '#86a8aa',
  '#c8bbb0',
  '#8f7b6f',
  '#c9a0ba',
  '#7fa5a8',
]

/**
 * Maps a Jellyfin genre tag to one of the bundled artwork families. Order
 * matters: the first substring match wins, so narrower tags ('dance-pop') must
 * appear before the broader ones they contain ('pop').
 */
export const genreArtworkFamilies = [
  ['r&b', 'rnb-soul'],
  ['rnb', 'rnb-soul'],
  ['soul', 'rnb-soul'],
  ['hip-hop', 'hip-hop'],
  ['hip hop', 'hip-hop'],
  ['rap', 'hip-hop'],
  ['drum and bass', 'drum-and-bass'],
  ['drum & bass', 'drum-and-bass'],
  ['d&b', 'drum-and-bass'],
  ['bollywood', 'bollywood-indian-pop'],
  ['indian pop', 'bollywood-indian-pop'],
  ['desi pop', 'bollywood-indian-pop'],
  ['indian classical', 'indian-classical'],
  ['hindustani', 'indian-classical'],
  ['carnatic', 'indian-classical'],
  ['qawwali', 'qawwali'],
  ['ghazal', 'ghazal'],
  ['j-pop', 'j-pop'],
  ['jrock', 'j-rock'],
  ['j-rock', 'j-rock'],
  ['k-pop', 'k-pop'],
  ['afrobeats', 'afrobeats'],
  ['lo-fi', 'lofi-chill'],
  ['lofi', 'lofi-chill'],
  ['chillout', 'lofi-chill'],
  ['singer-songwriter', 'singer-songwriter'],
  ['soundtrack', 'soundtrack'],
  ['film soundtrack', 'soundtrack'],
  ['new age', 'new-age'],
  ['ambient', 'ambient'],
  ['house', 'house'],
  ['techno', 'techno'],
  ['trance', 'trance'],
  ['dubstep', 'dubstep'],
  ['disco', 'disco-funk'],
  ['funk', 'disco-funk'],
  ['punk', 'punk'],
  ['metal', 'metal'],
  ['jazz', 'jazz'],
  ['classical', 'classical'],
  ['country', 'country'],
  ['latin', 'latin'],
  ['reggae', 'reggae'],
  ['folk', 'folk'],
  ['blues', 'blues'],
  ['alternative', 'alternative'],
  ['indie', 'indie'],
  ['gospel', 'gospel'],
  ['christian', 'gospel'],
  ['rock', 'rock'],
  ['electronic', 'electronic'],
  ['electropop', 'electronic'],
  ['synthwave', 'electronic'],
  ['synthpop', 'pop'],
  ['dance-pop', 'pop'],
  ['dance pop', 'pop'],
  ['pop', 'pop'],
] as const
