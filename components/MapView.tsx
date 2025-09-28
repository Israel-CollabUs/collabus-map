'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map, Marker as LeafletMarker } from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

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

function statusColor(s: string) {
  switch (s) {
    case 'active':
      return '#16a34a';
    case 'paused':
      return '#ca8a04';
    case 'ended':
      return '#991b1b';
    default:
      return '#334155';
  }
}

function directionsUrl(p: Partner) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    `${p.lat},${p.lng}`
  )}`;
}

function milesBetween(a: LatLng, b: LatLng) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const Rm = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * Rm * Math.asin(Math.min(1, Math.sqrt(h)));
}

export default function MapView({
  partners,
  userLocation = null,
  radiusMiles = 10,
}: {
  partners: Partner[];
  userLocation?: LatLng | null;
  radiusMiles?: number;
}) {
  const [map, setMap] = useState<Map | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRefs = useRef<Record<string, LeafletMarker | null>>({});

  // Client-only Leaflet icon patch
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (typeof window === 'undefined') return;
      const L = await import('leaflet');
      const DefaultIcon = L.icon({
        iconUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      if (mounted) {
        // @ts-expect-error leaflet prototype patch
        L.Marker.prototype.options.icon = DefaultIcon;
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Filter & sort partners (by distance if userLocation given)
  const visiblePartners = useMemo(() => {
    const base = (partners || []).filter(
      (p) =>
        p.is_public &&
        typeof p.lat === 'number' &&
        !Number.isNaN(p.lat) &&
        typeof p.lng === 'number' &&
        !Number.isNaN(p.lng)
    );
    if (!userLocation) return base;
    return base
      .map((p) => ({
        ...p,
        _dist: milesBetween(userLocation, { lat: p.lat, lng: p.lng }),
      }))
      .filter((p: any) => p._dist <= radiusMiles)
      .sort((a: any, b: any) => a._dist - b._dist);
  }, [partners, userLocation, radiusMiles]);

  const defaultCenter: LatLng = { lat: 39.7589, lng: -84.1916 }; // Dayton

  // Auto-fit to markers (and user location if set)
  useEffect(() => {
    if (!map) return;
    const pts: [number, number][] = [];
    if (userLocation) pts.push([userLocation.lat, userLocation.lng]);
    visiblePartners.forEach((p) => pts.push([p.lat, p.lng]));
    if (pts.length === 0) return;
    // @ts-ignore LatLngBoundsLiteral mismatch
    map.fitBounds(pts, { padding: [40, 40] });
  }, [map, visiblePartners, userLocation]);

  function focusPartner(p: Partner) {
    if (!map) return;
    map.flyTo([p.lat, p.lng], 15, { duration: 0.8 });
    const m = markerRefs.current[p.id];
    window.setTimeout(() => m?.openPopup(), 300);
  }

  return (
    <div className="card" style={{ padding: 16 }}>
      {/* desktop grid */}
      <style jsx>{`
        @media (min-width: 980px) {
          .two-col {
            display: grid;
            grid-template-columns: 420px 1fr;
            gap: 16px;
            align-items: start;
          }
        }
      `}</style>

      <div className="two-col">
        {/* LEFT: Partner list */}
        <div className="card" style={{ margin: 0 }}>
          <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>
            Partners ({visiblePartners.length})
          </div>

          {visiblePartners.length === 0 && (
            <div className="small">No public partners yet.</div>
          )}

          <div style={{ display: 'grid', gap: 8 }}>
            {visiblePartners.map((p) => {
              const s = p.collab?.status ?? 'active';
              return (
                <div
                  key={p.id}
                  className="card"
                  style={{
                    padding: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div className="small" style={{ opacity: 0.8 }}>
                      {p.address}
                    </div>
                    <div className="small" style={{ marginTop: 4 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: '#eef2ff',
                          border: `1px solid ${statusColor(s)}`,
                          color: statusColor(s),
                          fontSize: 12,
                          fontWeight: 600,
                          marginRight: 8,
                        }}
                      >
                        {s}
                      </span>
                      {p.collab?.popRule && (
                        <span className="small">Rule: {p.collab.popRule}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn secondary"
                      onClick={() => focusPartner(p)}
                      title="Fly to marker and open popup"
                    >
                      Focus
                    </button>
                    <a
                      className="btn"
                      href={directionsUrl(p)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open Google Maps directions"
                    >
                      Directions
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Map */}
        <div
          className="card"
          style={{ height: 580, borderRadius: 12, overflow: 'hidden', margin: 0 }}
        >
          <MapContainer
            center={[defaultCenter.lat, defaultCenter.lng]}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
            ref={(m) => {
              if (m) {
                mapRef.current = m;
                setMap(m);
              }
            }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* (Optional) show user location pin */}
            {userLocation && (
              <Marker position={[userLocation.lat, userLocation.lng]}>
                <Popup>You are here</Popup>
              </Marker>
            )}

            {visiblePartners.map((p) => {
              const s = p.collab?.status ?? 'active';
              return (
                <Marker
                  key={p.id}
                  position={[p.lat, p.lng]}
                  ref={(ref) =>
                    (markerRefs.current[p.id] =
                      ref as unknown as LeafletMarker)
                  }
                >
                  <Popup>
                    <div style={{ display: 'grid', gap: 6, minWidth: 220 }}>
                      <div style={{ fontWeight: 700 }}>{p.name}</div>
                      <div className="small">{p.address}</div>

                      <div
                        className="small"
                        style={{
                          display: 'flex',
                          gap: 8,
                          alignItems: 'center',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: '#eef2ff',
                            border: `1px solid ${statusColor(s)}`,
                            color: statusColor(s),
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {s}
                        </span>
                        {p.collab?.popRule && (
                          <span className="small" title="Promo Rule">
                            • {p.collab.popRule}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <a
                          className="btn small"
                          href={directionsUrl(p)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Get Directions
                        </a>
                        {p.website && (
                          <a
                            className="btn secondary small"
                            href={p.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Website
                          </a>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
