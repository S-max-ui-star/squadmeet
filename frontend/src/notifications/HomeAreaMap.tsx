import L from 'leaflet'
import { useEffect } from 'react'
import { AttributionControl, Circle, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'

export type Point = { lat: number; lon: number }

type Props = {
  point: Point | null
  radiusKm: number
  // Where the map starts while no point is set: the middle of the main map.
  fallbackCenter: [number, number]
  onPick: (point: Point) => void
}

/** The small map in the Home area dialog (SCRUM-45): a tap sets the point, the circle shows the
 * radius. */
export default function HomeAreaMap({ point, radiusKm, fallbackCenter, onPick }: Props) {
  const center: [number, number] = point ? [point.lat, point.lon] : fallbackCenter
  return (
    // As on the main map: only "© OpenStreetMap", no Leaflet prefix (SCRUM-191).
    <MapContainer center={center} zoom={12} className="home-area-map" attributionControl={false}>
      <AttributionControl prefix={false} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <PickOnTap onPick={onPick} />
      {point && (
        <>
          <Circle center={[point.lat, point.lon]} radius={radiusKm * 1000} />
          <CircleMarker center={[point.lat, point.lon]} radius={6} />
          <FitCircle point={point} radiusKm={radiusKm} />
        </>
      )}
    </MapContainer>
  )
}

function PickOnTap({ onPick }: { onPick: (point: Point) => void }) {
  useMapEvents({ click: (event) => onPick({ lat: event.latlng.lat, lon: event.latlng.lng }) })
  return null
}

// The whole circle stays in view when the point or the radius changes.
function FitCircle({ point, radiusKm }: { point: Point; radiusKm: number }) {
  const map = useMap()
  const { lat, lon } = point
  useEffect(() => {
    map.fitBounds(L.latLng(lat, lon).toBounds(radiusKm * 2000))
  }, [map, lat, lon, radiusKm])
  return null
}
