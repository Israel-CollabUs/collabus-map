'use client';

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import dynamic from 'next/dynamic';
const AdminMiniMap = dynamic(() => import('../components/AdminMiniMap'), { ssr: false });


function normalizeCoordinates(inputLat: string, inputLng: string) {
  let lat = parseFloat((inputLat || '').trim());
  let lng = parseFloat((inputLng || '').trim());
<div style={{ gridColumn:'1 / span 2' }}>
  <button className="btn secondary" onClick={geocodeAddress}>Auto-Fill Lat/Lng from Address</button>
  <span className="small" style={{ marginLeft: 8, opacity: .8 }}>Uses OpenStreetMap Nominatim</span>
</div>


  // Basic validity
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error('Latitude/Longitude must be numbers (decimal degrees).');
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('Latitude must be between -90 and 90, longitude between -180 and 180.');
  }

  // USA longitudes should be negative; fix common mistake
  if (lng > 0) lng = -lng;

  // Detect obvious swaps: lat looks like a longitude magnitude and lng like a latitude
  if (Math.abs(lat) > 60 && Math.abs(lng) < 60) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
    // Re-apply USA correction
    if (lng > 0) lng = -lng;
  }

  // Dayton-ish sanity snap (optional safety): warn if far away
  const DAYTON = { lat: 39.7589, lng: -84.1916 };
  const dLat = Math.abs(lat - DAYTON.lat);
  const dLng = Math.abs(lng - DAYTON.lng);
  const obviouslyFar = dLat > 10 || dLng > 10; // ~ >600 miles
  return { lat, lng, obviouslyFar };
}

type Partner = {
  id: string;
  name: string;
  category: string[];
  address: string;
  lat: number;
  lng: number;
  phone?: string;
  website?: string;
  instagram?: string;
  collab: {
    partnerIds: string[];
    popRule: string;
    code: string;
    status: 'active' | 'paused' | 'ended';
  };
  is_public: boolean;
};

export default function Admin() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [partners, setPartners] = useState<Partner[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>({
    name: '',
    address: '',
    lat: '',
    lng: '',
    category: 'Coffee/Tea',
    website: '',
    popRule: '',
    code: '',
    status: 'active',
    is_public: true,
  });

  // ---- Auth session wiring
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) =>
      setSession(sess)
    );
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // ---- Load data after login
  useEffect(() => {
    if (!session) return;
    loadPartners();
  }, [session]);

  async function signIn() {
    if (!email) return alert('Enter email');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert(error.message);
    else alert('Check your email for the magic link.');
  }

  async function loadPartners() {
    const { data, error } = await supabase
      .from('partners')
      .select('*')
      .order('name', { ascending: true });
    if (error) return alert(error.message);
    setPartners((data || []) as any);
  }

async function savePartner() {
  try {
    // 1) Coordinates: use provided lat/lng or geocode from address if blank
    let lat: number;
    let lng: number;

    const hasLatLng =
      form.lat != null && String(form.lat).trim() !== '' &&
      form.lng != null && String(form.lng).trim() !== '';

    if (hasLatLng) {
      // Manual entry
      const norm = normalizeCoordinates(form.lat, form.lng);
      lat = norm.lat;
      lng = norm.lng;
    } else if (form.address && String(form.address).trim() !== '') {
      // Geocode from address
      const geo = await geocodeAddress(form.address);
      if (!geo) {
        alert('Could not find coordinates for that address. Please enter lat/lng manually.');
        return;
      }
      const norm = normalizeCoordinates(String(geo.lat), String(geo.lng));
      lat = norm.lat;
      lng = norm.lng;
    } else {
      alert('Please provide either (1) an address to geocode or (2) latitude & longitude.');
      return;
    }

    // 2) Build payload (adjust `category` shape to match your DB type)
    const payload: any = {
      name: form.name,
      address: form.address,
      lat,
      lng,
      category: Array.isArray(form.category) ? form.category : [form.category], // text[] in DB
      website: form.website || null,
      collab: {
        partnerIds: [],
        popRule: form.popRule || '',
        code: form.code || '',
        status: form.status || 'active',
      },
      is_public: !!form.is_public,
    };

    // 3) Insert
    const { error } = await supabase.from('partners').insert(payload);
    if (error) throw error;

    // 4) Reset form & reload
    setForm({
      name: '',
      address: '',
      lat: '',
      lng: '',
      category: 'Coffee/Tea',
      website: '',
      popRule: '',
      code: '',
      status: 'active',
      is_public: true,
    });
    await loadPartners();
  } catch (e: any) {
    console.error(e);
    alert(e.message || 'Failed to save partner.');
  }
}


async function updatePartner() {
  if (!editingId) return;
  try {
    let lat: number;
    let lng: number;

    const hasLatLng =
      form.lat != null && String(form.lat).trim() !== '' &&
      form.lng != null && String(form.lng).trim() !== '';

    if (hasLatLng) {
      const norm = normalizeCoordinates(form.lat, form.lng);
      lat = norm.lat;
      lng = norm.lng;
    } else if (form.address && String(form.address).trim() !== '') {
      const geo = await geocodeAddress(form.address);
      if (!geo) {
        alert('Could not find coordinates for that address. Please enter lat/lng manually.');
        return;
      }
      const norm = normalizeCoordinates(String(geo.lat), String(geo.lng));
      lat = norm.lat;
      lng = norm.lng;
    } else {
      alert('Please provide either (1) an address to geocode or (2) latitude & longitude.');
      return;
    }

    const payload: any = {
      name: form.name,
      address: form.address,
      lat,
      lng,
      category: Array.isArray(form.category) ? form.category : [form.category],
      website: form.website || null,
      collab: {
        partnerIds: [],
        popRule: form.popRule || '',
        code: form.code || '',
        status: form.status || 'active',
      },
      is_public: !!form.is_public,
    };

    const { error } = await supabase.from('partners').update(payload).eq('id', editingId);
    if (error) throw error;

    setEditingId(null);
    setForm({
      name: '',
      address: '',
      lat: '',
      lng: '',
      category: 'Coffee/Tea',
      website: '',
      popRule: '',
      code: '',
      status: 'active',
      is_public: true,
    });
    await loadPartners();
  } catch (e: any) {
    console.error(e);
    alert(e.message || 'Failed to update partner.');
  }
}


  async function toggleStatus(p: Partner) {
    const next =
      p.collab.status === 'active'
        ? 'paused'
        : p.collab.status === 'paused'
        ? 'ended'
        : 'active';
    const newCollab = { ...p.collab, status: next };
    const { error } = await supabase
      .from('partners')
      .update({ collab: newCollab })
      .eq('id', p.id);
    if (error) return alert(error.message);
    await loadPartners();
  }
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(address + ', Dayton, Ohio'); // bias locally; adjust as needed
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`, {
      headers: { 'Accept': 'application/json' },
    });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    console.error('Geocoding failed', e);
    return null;
  }
}

function normalizeCoordinates(inputLat?: string, inputLng?: string) {
  let lat = inputLat != null && inputLat !== '' ? parseFloat(String(inputLat).trim()) : NaN;
  let lng = inputLng != null && inputLng !== '' ? parseFloat(String(inputLng).trim()) : NaN;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error('Latitude/Longitude must be numbers (decimal degrees).');
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('Latitude must be between -90 and 90, longitude between -180 and 180.');
  }
  // USA safeguard: longitude should be negative
  if (lng > 0) lng = -lng;

  return { lat, lng };
}


  // ---- New: begin edit / update / hide / delete
  function beginEdit(p: Partner) {
    setEditingId(p.id);
    setForm({
      name: p.name,
      address: p.address,
      lat: String(p.lat),
      lng: String(p.lng),
      category: p.category?.[0] || 'Coffee/Tea',
      website: p.website || '',
      popRule: p.collab?.popRule || '',
      code: p.collab?.code || '',
      status: p.collab?.status || 'active',
      is_public: p.is_public,
    });
    if (typeof window !== 'undefined')
      window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function updatePartner() {
    if (!editingId) return;
    const payload: any = {
      name: form.name,
      address: form.address,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      category: [form.category],
      website: form.website || null,
      collab: {
        partnerIds: [],
        popRule: form.popRule,
        code: form.code,
        status: form.status,
      },
      is_public: !!form.is_public,
    };
    const { error } = await supabase
      .from('partners')
      .update(payload)
      .eq('id', editingId);
    if (error) return alert(error.message);
    setEditingId(null);
    resetForm();
    await loadPartners();
  }

  async function togglePublic(p: Partner) {
    const { error } = await supabase
      .from('partners')
      .update({ is_public: !p.is_public })
      .eq('id', p.id);
    if (error) return alert(error.message);
    await loadPartners();
  }

  async function deletePartner(p: Partner) {
    if (!confirm(`Delete "${p.name}" permanently? This cannot be undone.`))
      return;
    const { error } = await supabase.from('partners').delete().eq('id', p.id);
    if (error) return alert(error.message);
    await loadPartners();
  }

  function resetForm() {
    setForm({
      name: '',
      address: '',
      lat: '',
      lng: '',
      category: 'Coffee/Tea',
      website: '',
      popRule: '',
      code: '',
      status: 'active',
      is_public: true,
    });
  }

  // ---- Render
  if (!session) {
    return (
      <>
        <Head>
          <title>CollabUs Admin — Sign In</title>
        </Head>
        <main className="container">
          <h1>Admin Sign In</h1>
          <p className="small">
            Enter your email to receive a one-time login link.
          </p>
          <div className="card" style={{ maxWidth: 420 }}>
            <label>Email</label>
            <input
              className="pill"
              style={{ width: '100%', marginTop: 6 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@collabus.io"
            />
            <button className="btn" style={{ marginTop: 10 }} onClick={signIn}>
              Send magic link
            </button>
            <p className="small" style={{ marginTop: 10 }}>
              Limit access using Supabase Auth policies/allowlist.
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>CollabUs Admin</title>
      </Head>
      <main className="container">
        <h1>CollabUs Admin</h1>
        <p className="small">
          Add new partners, update status, hide/show on the public map, or
          delete.
        </p>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>{editingId ? 'Edit Partner' : 'Add Partner'}</h3>

          <div
            className="grid"
            style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}
          >
            <div>
              <label>Name</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label>Address</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div>
              <label>Latitude</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
              />
            </div>
            <div>
              <label>Longitude</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
              />
            </div>
            <div>
              <label>Category</label>
              <select
                className="pill"
                style={{ width: '100%' }}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option>Coffee/Tea</option>
                <option>Bakery</option>
                <option>Pizza</option>
                <option>Bar</option>
                <option>Dessert</option>
                <option>Food Truck</option>
                <option>Asian</option>
                <option>Vegan</option>
                <option>Southern</option>
                <option>Mediterranean</option>
                <option>Caribbean</option>
              </select>
            </div>
            <div>
              <label>Website</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div style={{ gridColumn: '1 / span 2' }}>
              <label>PoP Rule (what unlocks what?)</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={form.popRule}
                onChange={(e) => setForm({ ...form, popRule: e.target.value })}
                placeholder="Receipt at A ⇒ % off at B within 24h"
              />
            </div>
            <div>
              <label>Promo Code</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div>
              <label>Status</label>
              <select
                className="pill"
                style={{ width: '100%' }}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="ended">ended</option>
              </select>
            </div>
            <div>
              <label>Public?</label>
              <select
                className="pill"
                style={{ width: '100%' }}
                value={form.is_public ? 'yes' : 'no'}
                onChange={(e) =>
                  setForm({ ...form, is_public: e.target.value === 'yes' })
                }
              >
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
            <button
              className="btn"
              onClick={editingId ? updatePartner : savePartner}
            >
              {editingId ? 'Update Partner' : 'Save Partner'}
            </button>
            {editingId && (
              <button
                className="btn secondary"
                onClick={() => {
                  setEditingId(null);
                  resetForm();
                }}
              >
                Cancel
              </button>
            )}
          </div>
          {/* Live mini map preview */}
<div style={{ marginTop: '1rem' }}>
  <AdminMiniMap
    lat={form.lat ? parseFloat(form.lat) : undefined}
    lng={form.lng ? parseFloat(form.lng) : undefined}
    name={form.name}
    address={form.address}
  />
</div>

        </div>

        <div className="card">
          <h3>Existing Partners</h3>
          {partners.length === 0 && <p className="small">No partners yet.</p>}

          {partners.map((p) => (
            <div key={p.id} className="card" style={{ marginBottom: '.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{p.name}</div>
                  <div className="small">{p.address}</div>
                  <div className="small">
                    <b>Status:</b> {p.collab?.status}
                  </div>
                  <div className="small">
                    <b>Public:</b> {p.is_public ? 'yes' : 'no'}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn secondary" onClick={() => toggleStatus(p)}>
                    Cycle Status
                  </button>
                  <button className="btn secondary" onClick={() => beginEdit(p)}>
                    Edit
                  </button>
                  <button className="btn secondary" onClick={() => togglePublic(p)}>
                    {p.is_public ? 'Hide (remove from map)' : 'Show on map'}
                  </button>
                  <button
                    className="btn"
                    style={{ background: '#991B1B' }}
                    onClick={() => deletePartner(p)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
