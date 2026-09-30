import { lazy, Suspense, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Crosshair, MapPin, X } from "lucide-react";
import type { Coordinates } from "./LeafletLocationMap";

const LeafletLocationMap = lazy(() => import("./LeafletLocationMap"));

interface LocationPickerProps {
  value: Coordinates | null;
  onChange: (coordinates: Coordinates) => void;
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const reducedMotion = useReducedMotion();
  const [mapOpen, setMapOpen] = useState(false);
  const [error, setError] = useState("");

  function useCurrentLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => onChange({ lat: coords.latitude, lng: coords.longitude }),
      () => setError("We could not access your location. Choose a point on the map instead."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }

  return (
    <section className="location-picker" aria-labelledby="location-label">
      <div className="location-heading">
        <div>
          <span className="step-label">
            02 <span>·</span> WHERE
          </span>
          <h3 id="location-label">Pin the place</h3>
        </div>
        {value && (
          <span className="location-selected">
            <MapPin size={14} /> Location added
          </span>
        )}
      </div>
      <div className="location-actions">
        <button
          type="button"
          className="location-action location-action-primary"
          onClick={() => setMapOpen((open) => !open)}
        >
          <MapPin size={17} /> {mapOpen ? "Close map" : value ? "Adjust pin" : "Choose on map"}
        </button>
        <button type="button" className="location-action" onClick={useCurrentLocation}>
          <Crosshair size={17} /> Use my location
        </button>
      </div>
      {value && (
        <p className="coordinate-summary">
          {value.lat.toFixed(4)}° {value.lat >= 0 ? "N" : "S"}, {Math.abs(value.lng).toFixed(4)}°{" "}
          {value.lng >= 0 ? "E" : "W"}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <AnimatePresence initial={false}>
        {mapOpen && (
          <motion.div
            className="map-panel"
            initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
          >
            <div className="map-panel-heading">
              <span>Tap the map to place your pin</span>
              <button
                type="button"
                className="icon-button"
                onClick={() => setMapOpen(false)}
                aria-label="Close map"
              >
                <X size={17} />
              </button>
            </div>
            <Suspense
              fallback={
                <div className="map-loading" role="status">
                  Loading map…
                </div>
              }
            >
              <LeafletLocationMap value={value} onChange={onChange} />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
