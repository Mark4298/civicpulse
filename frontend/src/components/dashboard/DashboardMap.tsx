import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { MapPin } from "lucide-react";
import "leaflet/dist/leaflet.css";
import type { HotspotCluster } from "@civicpulse/shared";

interface DashboardMapProps {
  clusters: HotspotCluster[];
}

function priorityTone(score: number): { color: string; label: string } {
  if (score >= 12) return { color: "#F43F5E", label: "High priority" };
  if (score >= 5) return { color: "#F59E0B", label: "Medium priority" };
  return { color: "#10B981", label: "Lower priority" };
}

export default function DashboardMap({ clusters }: DashboardMapProps) {
  const center: [number, number] = [22.5, 80];

  return (
    <MapContainer center={center} zoom={4} scrollWheelZoom className="dashboard-leaflet">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {clusters.map((cluster) => {
        const tone = priorityTone(cluster.priorityScore);
        const radius = Math.max(7, Math.min(23, 6 + Math.sqrt(cluster.memberCount) * 2.2));
        return (
          <CircleMarker
            key={cluster.clusterId}
            center={[cluster.centroid.lat, cluster.centroid.lng]}
            radius={radius}
            pathOptions={{
              className: "dashboard-cluster-marker",
              color: tone.color,
              weight: 2,
              fillColor: tone.color,
              fillOpacity: 0.55,
            }}
          >
            <Popup className="dashboard-popup">
              <div className="map-popup-content">
                <span className="map-popup-kicker">
                  <MapPin size={12} /> {cluster.country}
                </span>
                <strong>{cluster.districtName}</strong>
                <span>{cluster.memberCount.toLocaleString()} clustered reports</span>
                <span>
                  {tone.label} · score {cluster.priorityScore.toFixed(1)}
                </span>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
