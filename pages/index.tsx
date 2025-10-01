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

type Collab = {
  id: string;
  name: string;
  tag: string | null;
  description?: string | null;
  link?: string | null;
  status: 'active' | 'paused' | 'ended';
  color?: string | null;
};

type CollabMember = {
  collab_id: string;
  partner_id: string;
};

type LatLng = { lat: number; lng: number };

// simple haversine for miles
function haversineMiles(a: LatLng, b: LatLng) {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function FilterBar({
  onLocation,
  onClear,
  radiusMiles,
  setRadiusMiles,
  showCollabs,
  setShowCollabs,
  collabs,
  selectedCollabId,
  setSelectedCollabId,
}: {
  onLocation: (loc: LatLng) => void;
  onClear: () => void;
  radiusMiles: number;
  setRadiusMiles: (n: number) => void;
  showCollabs: boolean;
  setShowCollabs: (v: boolean) => void;
  collabs: Collab[];
  selectedCollabId: string | 'all' | 'active' | 'none';
  setSelectedCollabId: (v: string | 'all' | 'active' | 'none') => void;
}) {
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);

  async function geocode() {
    if (!address) return;
    try {
      setBusy(true);
      const q = encodeURIComponent(address + ', Dayton, Ohio'); // bias to Dayton
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

  function useMyLocation() {
    if (!navigator.geolocation) {
      alert('Geolocation not supported in this browser.');
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setBusy(false);
      },
      () => {
        alert('Unable to access your location.');
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <label className="small">Radius:</label>
          <input
            type="range"
            min={1}
            max={25}
            value={radiusMiles}
            onChange={(e) => setRadiusMiles(parseInt(e.target.value, 10))}
          />
          <span className="small" style={{ width: 40, textAlign: 'right' }}>
            {radiusMiles} mi
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginTop: 10,
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showCollabs}
            onChange={(e) => setShowCollabs(e.target.checked)}
          />
          Show Collabs (lines)
        </label>

        <select
          className="pill"
          value={selectedCollabId}
          onChange={(e) =>
            setSelectedCollabId(e.target.value as 'all' | 'active' | 'none' | string)
          }
        >
          <option value="active">All Active Collabs</option>
          <option value="all">All Collabs</option>
          <option value="none">No Collab Filter</option>
          {collabs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.tag ? `(${c.tag})` : ''}
            </option>
          ))}
        </select>

        <span className="small" style={{ opacity: 0.8 }}>
          Tip: pick a specific collab to only show its connections.
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [members, setMembers] = useState<CollabMember[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [fetchMs, setFetchMs] = useState<number | null>(null);

  // New: user location + radius + focused partner + collab toggles
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [radiusMiles, setRadiusMiles] = useState<number>(5);
  const [focusPartnerId, setFocusPartnerId] = useState<string | null>(null);
  const [showCollabs, setShowCollabs] = useState<boolean>(false);
  const [selectedCollabId, setSelectedCollabId] = useState<'all' | 'active' | 'none' | string>(
    'active'
  );

  // Toggle debug with ?debug=1 or NEXT_PUBLIC_DEBUG=1
  const debug = useMemo(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('debug') === '1') return true;
    }
    return process.env.NEXT_PUBLIC_DEBUG === '1';
  }, []);

  // fetch partners + collabs (+ members) from Supabase, or local JSON fallback for partners only
  useEffect(() => {
    const t0 = performance.now();

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

    async function loadFromSupabase() {
      const supabase = createClient(url!, key!);

      const [{ data: pData, error: pErr }, { data: cData, error: cErr }, { data: mData, error: mErr }] =
        await Promise.all([
          supabase.from('partners').select('*').eq('is_public', true).order('name', { ascending: true }),
          supabase.from('collabs').select('*').order('name', { ascending: true }),
          supabase.from('collab_members').select('collab_id, partner_id'),
        ]);

      if (pErr) throw pErr;
      const rows = (pData || []).map((p: any) => ({
        ...p,
        lat: typeof p.lat === 'string' ? parseFloat(p.lat) : p.lat,
        lng: typeof p.lng === 'string' ? parseFloat(p.lng) : p.lng,
      }));
      setPartners(rows);

      if (cErr) throw cErr;
      setCollabs((cData || []) as any);

      if (mErr) throw mErr;
      setMembers((mData || []) as any);

      setFetchMs(Math.round(performance.now() - t0));
    }

    async function loadFromLocal() {
      // Partners only; collab lines won’t work in “local” mode
      const m = await import('../data/partners.json');
      const rows = (m.default as any[])
        .filter((p) => p.is_public)
        .map((p) => ({
          ...p,
          lat: typeof p.lat === 'string' ? parseFloat(p.lat) : p.lat,
          lng: typeof p.lng === 'string' ? parseFloat(p.lng) : p.lng,
        }));
      setPartners(rows);
      setCollabs([]); // none
      setMembers([]); // none
      setFetchMs(Math.round(performance.now() - t0));
    }

    if (!url || !key) {
      loadFromLocal().catch((e) => {
        setErr('Failed to load local partners.json');
        console.error(e);
      });
    } else {
      loadFromSupabase().catch((e) => {
        setErr('Supabase fetch error');
        console.error(e);
      });
    }
  }, []);

  // Compute filtered partners by userLocation + radius
  const visiblePartners = useMemo(() => {
    if (!userLocation) return partners;
    return partners.filter((p) => {
      const d = haversineMiles(userLocation, { lat: p.lat, lng: p.lng });
      return d <= radiusMiles;
    });
  }, [partners, userLocation, radiusMiles]);

  // Build collab edges to draw as polylines:
  // - Toggleable via showCollabs
  // - Filterable: 'active' (only active collabs), 'all' (all statuses), specific collab id, or 'none'
  // - Only draw lines if both endpoints are in visiblePartners (so radius filter applies)
  type Edge = {
    id: string; // `${collabId}:${aId}-${bId}`
    collabId: string;
    color?: string | null;
    a: LatLng & { id: string; name: string };
    b: LatLng & { id: string; name: string };
    popupHtml: string; // small description for popup
  };

  const collabEdges: Edge[] = useMemo(() => {
    if (!showCollabs || members.length === 0 || collabs.length === 0) return [];

    // Which collabs are eligible?
    const eligibleCollabs = collabs.filter((c) => {
      if (selectedCollabId === 'none') return false;
      if (selectedCollabId === 'all') return true;
      if (selectedCollabId === 'active') return c.status === 'active';
      return c.id === selectedCollabId; // specific collab
    });

    if (eligibleCollabs.length === 0) return [];

    const partnerMap = new Map(visiblePartners.map((p) => [p.id, p]));
    const byCollab = new Map<string, string[]>(); // collabId -> partnerIds[]
    members.forEach((m) => {
      if (!byCollab.has(m.collab_id)) byCollab.set(m.collab_id, []);
      byCollab.get(m.collab_id)!.push(m.partner_id);
    });

    const edges: Edge[] = [];
    for (const c of eligibleCollabs) {
      const ids = (byCollab.get(c.id) || []).filter((pid) => partnerMap.has(pid));
      if (ids.length < 2) continue;

      // Build undirected pairwise edges between all members of the collab (complete graph)
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const A = partnerMap.get(ids[i])!;
          const B = partnerMap.get(ids[j])!;
          edges.push({
            id: `${c.id}:${A.id}-${B.id}`,
            collabId: c.id,
            color: c.color || '#ef4444',
            a: { id: A.id, name: A.name, lat: A.lat, lng: A.lng },
            b: { id: B.id, name: B.name, lat: B.lat, lng: B.lng },
            popupHtml: `<div style="min-width:180px"><div style="font-weight:700;margin-bottom:2px">${c.name}</div>
              <div class="small">${A.name} ↔ ${B.name}</div>
              ${c.status ? `<div class="small"><b>Status:</b> ${c.status}</div>` : ''}
              ${
                c.link
                  ? `<div class="small" style="margin-top:4px"><a href="${c.link}" target="_blank" rel="noreferrer">Details</a></div>`
                  : ''
              }
            </div>`,
          });
        }
      }
    }
    return edges;
  }, [showCollabs, members, collabs, selectedCollabId, visiblePartners]);

  // Sidebar list item click
  function focusPartner(id: string) {
    setFocusPartnerId(id);
  }

  return (
    <main className="container">
      <h1>CollabUs Map</h1>
      <p className="small">
        Find active PoP collaborations near you. <b>{visiblePartners.length}</b> partner(s) visible
        {userLocation ? ` within ${radiusMiles} miles.` : '.'}
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
              <b>Partners:</b> {partners.length} | <b>Visible:</b> {visiblePartners.length} |{' '}
              <b>Collabs:</b> {collabs.length} | <b>Members:</b> {members.length} |{' '}
              <b>Edges:</b> {collabEdges.length} | <b>Fetch time:</b>{' '}
              {fetchMs !== null ? `${fetchMs}ms` : '—'}
            </div>
            {err && (
              <div style={{ color: '#b91c1c' }}>
                <b>Error:</b> {err}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filter bar (location, radius, collab toggles) */}
      <FilterBar
        onLocation={(loc) => setUserLocation(loc)}
        onClear={() => {
          setUserLocation(null);
          setFocusPartnerId(null);
        }}
        radiusMiles={radiusMiles}
        setRadiusMiles={setRadiusMiles}
        showCollabs={showCollabs}
        setShowCollabs={setShowCollabs}
        collabs={collabs}
        selectedCollabId={selectedCollabId}
        setSelectedCollabId={setSelectedCollabId}
      />

      {/* 2-column responsive layout: list + map */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: 'minmax(260px, 360px) 1fr',
          gap: '1rem',
        }}
      >
        {/* Sidebar list */}
        <div className="card" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Partners</h3>
          {visiblePartners.length === 0 && <p className="small">No partners in range.</p>}
          <div style={{ display: 'grid', gap: 8 }}>
            {visiblePartners.map((p) => (
              <div
                key={p.id}
                className="card"
                style={{ padding: 10, display: 'flex', justifyContent: 'space-between', gap: 8 }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div className="small" style={{ opacity: 0.9 }}>
                    {p.address}
                  </div>
                  {p.collab?.popRule && (
                    <div className="small" style={{ opacity: 0.8 }}>
                      PoP: {p.collab.popRule}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn secondary" onClick={() => focusPartner(p.id)}>
                    Focus
                  </button>
                  {p.website && (
                    <a className="btn ghost" href={p.website} target="_blank" rel="noreferrer">
                      Website
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="card" style={{ height: 520 }}>
          <div className="map" id="map" style={{ height: '100%', width: '100%' }}>
            <MapView
              partners={visiblePartners}
              userLocation={userLocation}
              radiusMiles={userLocation ? radiusMiles : undefined}
              focusPartnerId={focusPartnerId}
              onPartnerClick={(id) => setFocusPartnerId(id)}
              // NEW: collab edges
              collabEdges={collabEdges}
              showCollabs={showCollabs}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

// Prevent static pre-render for '/'
export async function getServerSideProps() {
  return { props: {} };
}
