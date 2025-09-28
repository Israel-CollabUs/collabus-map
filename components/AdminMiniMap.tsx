'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import type { Map } from 'leaflet';
import { useEffect, useRef, useState } from 'react';

type Props = {
  lat?: number;
  lng?: number;
  name?: string;
  address?: string;
};

export default function AdminMiniMap({ lat, lng, name, address }: Props) {
  const [ready, setReady] = useState(false);
  const mapRef = useRef<Map | null>(null);

  // Load Leaflet icons on client only
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
        // @ts-expect-error prototype patch
        L.Marker.prototype.options.icon = DefaultIcon;
        setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const hasPoint =
    typeof lat === 'number' &&
    !Number.isNaN(lat) &&
    typeof lng === 'number' &&
    !Number.isNaN(lng);

  const center = hasPoint
    ? [lat as number, lng as number]
    : ([39.7589, -84.1916] as [number, number]); // Dayton

  if (!ready) return null;

  return (
    <div
      className="card"
      style={{ height: 260, borderRadius: 12, overflow: 'hidden' }}
    >
      <MapContainer
        center={center}
        zoom={hasPoint ? 15 : 12}
        style={{ height: '100%', width: '100%' }}
        ref={(m) => (mapRef.current = m)}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasPoint && (
          <Marker position={[lat as number, lng as number]}>
            <Popup>
              <div style={{ fontWeight: 700 }}>{name || 'New Partner'}</div>
              <div className="small">{address}</div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
