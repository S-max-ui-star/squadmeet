// City report (SCRUM-55, see CONTEXT.md): where to tell the city about a problem at a Place.
// Per city: its official defect report (online), and the office that looks after green spaces
// and playgrounds, with e-mail and phone. The app only links there; it sends nothing itself
// (ADR-0005). Checked on 2026-10-13 against the cities' own pages (sources in HANDOFF.md).
// A Place belongs to the nearest of the five cities whose Places we import (backend/data/osm),
// when it is at most MAX_DISTANCE_KM away.

export type Phone = { number: string; note: string }

export type CityReport = {
  city: string
  // The city's online defect report.
  portal: { name: string; url: string }
  // The city's general phone line for such reports; null when it names none.
  phone: Phone | null
  // The office responsible for parks, green spaces and playgrounds.
  office: { name: string; email: string; phone: Phone | null }
  center: [number, number]
}

export const CITY_REPORTS: CityReport[] = [
  {
    city: 'Leipzig',
    portal: { name: 'Mängelmelder der Stadt Leipzig', url: 'https://mitdenken.sachsen.de/maengelmelder-L' },
    phone: { number: '0341 115', note: 'Bürgertelefon, Mo–Fr 7:30–18 Uhr' },
    office: { name: 'Amt für Stadtgrün und Gewässer', email: 'stadtgruen.gewaesser@leipzig.de', phone: null },
    center: [51.3397, 12.3731],
  },
  {
    city: 'Erfurt',
    portal: { name: 'Mängelmelder der Landeshauptstadt Erfurt', url: 'https://maengelmelder.erfurt.de/' },
    phone: null,
    office: {
      name: 'Garten- und Friedhofsamt',
      email: 'gartenamt@erfurt.de',
      phone: { number: '0361 655-5801', note: 'Bürgertelefon Grün- und Baumpflege' },
    },
    center: [50.9787, 11.0328],
  },
  {
    city: 'Hannover',
    portal: { name: 'Hannover sauber! (aha) – Müll melden', url: 'https://app.hannover-sauber.de/' },
    phone: { number: '0800 999 11 99', note: 'aha-Servicetelefon, kostenlos' },
    office: {
      name: 'Bereich Grünflächen, Fachbereich Umwelt und Stadtgrün',
      email: '67.3Buergeranfragen@hannover-stadt.de',
      phone: { number: '0511 168-44353', note: 'Di–Do 9–12 Uhr' },
    },
    center: [52.3759, 9.732],
  },
  {
    city: 'Stuttgart',
    portal: { name: 'Gelbe Karte der Stadt Stuttgart', url: 'https://service.stuttgart.de/lhs-services/stoerung/' },
    phone: { number: '115', note: 'Behördennummer, Mo–Fr 8–18 Uhr' },
    office: {
      name: 'Garten-, Friedhofs- und Forstamt, Abteilung Stadtgrün',
      email: 'Poststelle.67@stuttgart.de',
      phone: { number: '0711 216-98006', note: 'Abteilung Stadtgrün' },
    },
    center: [48.7758, 9.1829],
  },
  {
    city: 'Potsdam',
    portal: { name: 'Mängelmelder der Landeshauptstadt Potsdam', url: 'https://mitgestalten.potsdam.de/de/maengel-melden' },
    phone: null,
    office: {
      name: 'Bereich Grünflächen',
      email: 'gruenanlagen@rathaus.potsdam.de',
      phone: { number: '0331 289-4601', note: 'Bereich Grünflächen' },
    },
    center: [52.3906, 13.0645],
  },
]

// Further than this from every city center: no City report (a Place outside the five cities).
const MAX_DISTANCE_KM = 25

function distanceKm([lat1, lon1]: [number, number], [lat2, lon2]: [number, number]): number {
  const rad = Math.PI / 180
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

export function findCityReport(lat: number, lon: number): CityReport | null {
  let best: CityReport | null = null
  let bestKm = MAX_DISTANCE_KM
  for (const report of CITY_REPORTS) {
    const km = distanceKm([lat, lon], report.center)
    if (km <= bestKm) {
      best = report
      bestKm = km
    }
  }
  return best
}

// The text to copy into the city's form or e-mail: the address if known, the coordinates, and
// a map link.
export function placeText(name: string, lat: number, lon: number, address: string | null): string {
  const where = `${lat.toFixed(5)}, ${lon.toFixed(5)}`
  const map = `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lon.toFixed(5)}#map=19/${lat.toFixed(5)}/${lon.toFixed(5)}`
  return [name, address, where, map].filter(Boolean).join('\n')
}

// A mailto link to the office, with a subject and the Place in the body; the user writes the rest.
export function mailtoLink(email: string, name: string, lat: number, lon: number, address: string | null): string {
  const subject = `Mangel an einem öffentlichen Platz: ${name}`
  const body = `Guten Tag,\n\nan diesem Platz ist mir aufgefallen:\n\n\n\nOrt:\n${placeText(name, lat, lon, address)}\n`
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// "0341 115" -> "tel:0341115"
export function telLink(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`
}
