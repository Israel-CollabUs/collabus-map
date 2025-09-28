// pages/index.tsx
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@supabase/supabase-js';

// Client-only MapView (prevents SSR issues with react-leaflet)
const MapView = dynamic(() => import('../components/MapView'), { ssr: false });

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

/** ---- Small helper UI that stays in THIS FILE, above Home() ---- */
function FilterBar({
  onLocation,
  onClear,
  radiusMiles,
  setRadiusMiles,
}: {
  onLocation: (loc: LatLng) => void;
  onClear: () => void;
  radiusMiles: number;
  setRadiusMiles: (n: number) => void;
}) {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  async function geocode() {
    if (!address) return;
    try {
      setBusy(true);
      const q = encodeURIComponent(address + ', Dayton, Ohio');
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`
      );
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        alert('Address not found. Try refining it.');
        return;
      }
      onLocation({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
    } catch {
      alert('Geocoding failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

async function useMyLocation() {
  if (!navigator.geolocation) {
    alert('Geolocation not supported in this browser.');
    return;
  }
  setBusy(true);

  try {
    // Optional: check current permission state for clearer UX
    if (navigator.permissions && (navigator.permissions as any).query) {
      try {
        const status = await (navigator.permissions as any).query({ name: 'geolocation' });
        if (status.state === 'denied') {
          setBusy(false);
          alert(
            'Location access is blocked for this site. Click the lock icon in your address bar → Site settings → allow Location, then refresh.'
          );
          return;
        }
      } catch {}
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setBusy(false);
      },
      async (err) => {
        setBusy(false);
        const msg =
          err.code === 1
            ? 'Permission denied. Please allow location access and try again.'
            : err.code === 2
            ? 'Position unavailable. Try again or check your network.'
            : err.code === 3
            ? 'Location request timed out. Try again.'
            : 'Unable to access your location.';

        // Offer an approximate IP-based fallback
        const useFallback = confirm(
          `${msg}\n\nWould you like to use an approximate location based on your IP address instead?`
        );
        if (useFallback) {
          const approx = await ipApproximateLocation();
          if (approx) {
            onLocation(approx);
          } else {
            alert('Could not determine an approximate location.');
          }
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } catch (e) {
    setBusy(false);
    alert('Unexpected error requesting your location. Please try again.');
  }
}

// Very rough fallback using a free IP geolocation service
async function ipApproximateLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    // You can swap this for another service if you prefer.
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      return { lat: data.latitude, lng: data.longitude };
    }
    return null;
  } catch {
    return null;
  }
}


  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="pill"
          placeholder="Enter your address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{ flex: '1 1 260px' }}
        />
        <button className="btn" onClick={geocode} disabled={busy}>
          Search
        </button>
        <button className="btn secondary" onClick={useMyLocation} disabled={busy}>
          Use my location
        </button>
        <button className="btn ghost" onClick={onClear}>
          Clear
        </button>

        {/* Radius selector */}
        <div className="small" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Radius:</span>
          <select
            className="pill"
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(parseInt(e.target.value, 10))}
          >
            <option value={5}>5 mi</option>
            <option value={10}>10 mi</option>
            <option value={15}>15 mi</option>
            <option value={25}>25 mi</option>
            <option value={50}>50 mi</option>
          </select>
        </div>
      </div>
      <div className="small" style={{ marginTop: 6, opacity: 0.8 }}>
        Tip: We’ll filter partners within your chosen radius and auto-fit the map.
      </div>
    </div>
  );
}

/** ----------------------- Main page component ----------------------- */
export default function Home() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [fetchMs, setFetchMs] = useState<number | null>(null);

  // NEW: state for location filtering
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [radiusMiles, setRadiusMiles] = useState<number>(10);

  // Toggle debug with ?debug=1 or NEXT_PUBLIC_DEBUG=1
  const debug = useMemo(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('debug') === '1') return true;
    }
    return process.env.NEXT_PUBLIC_DEBUG === '1';
  }, []);

  useEffect(() => {
    const t0 = performance.now();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

    // Fallback to local JSON when env is missing (handy in dev)
    if (!url || !key) {
      import('../data/partners.json')
        .then((m) => {
          const rows = (m.default as any[])
            .filter((p) => p.is_public)
            .map((p) => ({
              ...p,
              lat: typeof p.lat === 'string' ? parseFloat(p.lat) : p.lat,
              lng: typeof p.lng === 'string' ? parseFloat(p.lng) : p.lng,
            }));
          setPartners(rows);
          setFetchMs(Math.round(performance.now() - t0));
        })
        .catch((e) => {
          setErr('Failed to load local partners.json');
          console.error(e);
        });
      return;
    }

    const supabase = createClient(url, key);
    supabase
      .from('partners')
      .select('*')
      .eq('is_public', true)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setErr(error.message);
          console.error('Supabase select error:', error);
          setPartners([]);
        } else {
          const rows = (data || []).map((p: any) => ({
            ...p,
            lat: typeof p.lat === 'string' ? parseFloat(p.lat) : p.lat,
            lng: typeof p.lng === 'string' ? parseFloat(p.lng) : p.lng,
          }));
          setPartners(rows);
        }
        setFetchMs(Math.round(performance.now() - t0));
      })
      .catch((e) => {
        setErr('Unexpected fetch error');
        console.error(e);
      });
  }, []);

  return (
    <main className="container">
      <h1>CollabUs Map</h1>
      <p className="small">
        Find active PoP collaborations near you. <b>{partners.length}</b> public partner(s) loaded.
      </p>

      {/* Debug Panel */}
      {debug && (
        <div className="card" style={{ marginBottom: '1rem', borderColor: '#7c3aed' }}>
          <h3 style={{ marginTop: 0 }}>Debug Panel</h3>
          <div className="small">
            <div>
              <b>Env present:</b>{' '}
              URL: <code>{String(!!process.env.NEXT_PUBLIC_SUPABASE_URL)}</code>
              {'  '}| ANON:{' '}
              <code>{String(!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)}</code>
            </div>
            <div>
              <b>Count:</b> {partners.length} {'  '}| <b>Fetch time:</b>{' '}
              {fetchMs !== null ? `${fetchMs}ms` : '—'}
            </div>
            {err && (
              <div style={{ color: '#b91c1c' }}>
                <b>Error:</b> {err}
              </div>
            )}
            <details style={{ marginTop: 8 }}>
              <summary>First 3 partners</summary>
              <pre style={{ whiteSpace: 'pre-wrap', overflowX: 'auto' }}>
                {JSON.stringify(partners.slice(0, 3), null, 2)}
              </pre>
            </details>
            <div style={{ marginTop: 8 }}>
              Tip: If count is 0, check Supabase:
              <pre style={{ whiteSpace: 'pre-wrap' }}>{`-- SQL to run
select id, name, is_public, lat, lng from public.partners where is_public = true order by name limit 20;`}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Filter bar (address / GPS + radius) */}
      <FilterBar
        onLocation={(loc) => setUserLocation(loc)}
        onClear={() => setUserLocation(null)}
        radiusMiles={radiusMiles}
        setRadiusMiles={setRadiusMiles}
      />

      <MapView partners={partners} userLocation={userLocation} radiusMiles={radiusMiles} />
    </main>
  );
}

// Prevent static pre-render for '/'
export async function getServerSideProps() {
  return { props: {} };
}
