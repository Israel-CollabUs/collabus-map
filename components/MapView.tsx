import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
  useMapEvent,
} from 'react-leaflet';
import type { Map } from 'leaflet';

// Avoid SSR “window is not defined” for leaflet icon setup
let L: any = null;
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  L = require('leaflet');

  // Default marker icon (CDN images)
  const DefaultIcon = L.icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
  if (L && L.Marker) L.Marker.prototype.options.icon = DefaultIcon;
}

type Partner = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  website?: string | null;
  is_public: boolean;
  collab?: { status?: 'active' | 'paused' | 'ended'; popRule?: string };
};

type LatLng = { lat: number; lng: number };

type Edge = {
  id: string;
  collabId: string;
  color?: string | null;
  a: LatLng & { id: string; name: string };
  b: LatLng & { id: string; name: string };
  popupHtml: string;
};

function milesToMeters(mi: number) {
  return mi * 1609.34;
}

function useFocusEffect(mapRef: React.MutableRefObject<Map | null>, target?: LatLng | null) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !target) return;
    map.setView([target.lat, target.lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [target, mapRef]);
}

function MapClickClosePopup() {
  const map = useMap();
  useMapEvent('click', () => {
    map.closePopup();
  });
  return null;
}

export default function MapView({
  partners,
  userLocation,
  radiusMiles,
  focusPartnerId,
  onPartnerClick,
  collabEdges,
  showCollabs,
}: {
  partners: Partner[];
  userLocation?: LatLng | null;
  radiusMiles?: number;
  focusPartnerId?: string | null;
  onPartnerClick?: (id: string) => void;
  collabEdges?: Edge[];
  showCollabs?: boolean;
}) {
  const mapRef = useRef<Map | null>(null);

  // Compute center: prioritize user location, else average of markers, else Dayton
  const center = useMemo<LatLng>(() => {
    if (userLocation) return userLocation;
    if (partners.length > 0) {
      const avgLat = partners.reduce((s, p) => s + p.lat, 0) / partners.length;
      const avgLng = partners.reduce((s, p) => s + p.lng, 0) / partners.length;
      return { lat: avgLat, lng: avgLng };
    }
    return { lat: 39.7589, lng: -84.1916 }; // Dayton fallback
  }, [userLocation, partners]);

  // When focusPartnerId changes, pan/zoom to it
  const focusTarget = useMemo<LatLng | null>(() => {
    if (!focusPartnerId) return null;
    const p = partners.find((x) => x.id === focusPartnerId);
    return p ? { lat: p.lat, lng: p.lng } : null;
  }, [focusPartnerId, partners]);

  useFocusEffect(mapRef, focusTarget);

  return (
    <>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        whenReady={(e) => (mapRef.current = e.target as Map)}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Optional: show user location + radius */}
        {userLocation && (
          <>
            <Marker position={[userLocation.lat, userLocation.lng]}>
              <Popup>You are here.</Popup>
            </Marker>
            {radiusMiles && radiusMiles > 0 && (
              <Circle
                center={[userLocation.lat, userLocation.lng]}
                radius={milesToMeters(radiusMiles)}
                pathOptions={{ color: '#2563eb', weight: 1 }}
              />
            )}
          </>
        )}

        {/* Collab lines (polylines) */}
        {showCollabs &&
          (collabEdges || []).map((edge) => (
            <Polyline
              key={edge.id}
              positions={[
                [edge.a.lat, edge.a.lng],
                [edge.b.lat, edge.b.lng],
              ]}
              pathOptions={{
                color: edge.color || '#ef4444',
                weight: 3,
                opacity: 0.8,
              }}
              eventHandlers={{
                click: (e) => {
                  // Simple popup on click (Leaflet DOM-based)
                  const map = mapRef.current;
                  if (!map || !L) return;
                  L.popup()
                    .setLatLng(e.latlng)
                    .setContent(edge.popupHtml)
                    .openOn(map);
                },
              }}
            />
          ))}

        {/* Partner markers */}
        {partners.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            eventHandlers={{
              click: () => onPartnerClick?.(p.id),
            }}
          >
            <Popup>
              <div style={{ minWidth: 200 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div className="small">{p.address}</div>
                {p.collab?.status && (
                  <div className="small">
                    <b>Status:</b> {p.collab.status}
                  </div>
                )}
                {p.collab?.popRule && (
                  <div className="small" style={{ opacity: 0.9 }}>
                    PoP: {p.collab.popRule}
                  </div>
                )}
                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                  <a
                    className="btn secondary"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      p.address || `${p.lat},${p.lng}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions
                  </a>
                  {p.website && (
                    <a className="btn ghost" href={p.website} target="_blank" rel="noreferrer">
                      Website
                    </a>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <MapClickClosePopup />
      </MapContainer>
    </>
  );
}
