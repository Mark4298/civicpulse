import { useCallback } from "react";
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface Coordinates {
  lat: number;
  lng: number;
}

interface LeafletLocationMapProps {
  value: Coordinates | null;
  onChange: (coordinates: Coordinates) => void;
}

function MapClick({ onChange }: Pick<LeafletLocationMapProps, "onChange">) {
  const handleClick = useCallback(
    (event: { latlng: Coordinates }) => {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
    [onChange],
  );
  useMapEvents({ click: handleClick });
  return null;
}

export default function LeafletLocationMap({ value, onChange }: LeafletLocationMapProps) {
  const center: [number, number] = value ? [value.lat, value.lng] : [22.5, 80];
  return (
    <div className="leaflet-frame">
      <MapContainer
        center={center}
        zoom={value ? 12 : 4}
        scrollWheelZoom={false}
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClick onChange={onChange} />
        {value && (
          <CircleMarker
            center={[value.lat, value.lng]}
            radius={9}
            pathOptions={{ color: "#22D3EE", weight: 3, fillColor: "#22D3EE", fillOpacity: 0.88 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
