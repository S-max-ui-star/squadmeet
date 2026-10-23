import { Marker, useMap } from 'react-leaflet'
import { clusterBounds, placeCount, type Cluster } from './clusters'
import { clusterIcon } from './markers'

/** Several Places close together (SCRUM-166). A tap or Enter zooms to them, so they split. */
export default function ClusterMarker({ cluster }: { cluster: Cluster }) {
  const map = useMap()
  const count = placeCount(cluster)
  return (
    <Marker
      position={[cluster.lat, cluster.lon]}
      icon={clusterIcon(count)}
      title={`${count} Plätze, heranzoomen`}
      eventHandlers={{ click: () => map.fitBounds(clusterBounds(cluster), { padding: [48, 48] }) }}
    />
  )
}
