'use client';

import Head from 'next/head';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabaseClient';

// ---- Types -----------------------------------------------------------------

type Partner = {
  id: string;
  name: string;
  category: string[];   // stored as text[] in DB
  address: string;
  lat: number;
  lng: number;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
  collab: {
    partnerIds: string[];
    popRule: string;
    code: string;
    status: 'active' | 'paused' | 'ended';
  };
  is_public: boolean;
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

// ---- Helpers (no JSX here!) ------------------------------------------------

function makeUUID(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
    return (crypto as any).randomUUID();
  }
  try {
    return uuidv4();
  } catch {}
  // last-resort fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const q = encodeURIComponent(address + ', Dayton, Ohio'); // local bias
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
      { headers: { Accept: 'application/json' } }
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (e) {
    console.error('Geocoding failed', e);
    return null;
  }
}

function normalizeCoordinates(inputLat?: string, inputLng?: string) {
  let lat =
    inputLat != null && inputLat !== '' ? parseFloat(String(inputLat).trim()) : NaN;
  let lng =
    inputLng != null && inputLng !== '' ? parseFloat(String(inputLng).trim()) : NaN;

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new Error('Latitude/Longitude must be numbers (decimal degrees).');
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new Error('Latitude must be between -90 and 90, longitude between -180 and 180.');
  }
  // USA safeguard: longitude should be negative
  if (lng > 0) lng = -lng;

  // Detect swapped values (common copy/paste issue)
  if (Math.abs(lat) > 60 && Math.abs(lng) < 60) {
    const tmp = lat;
    lat = lng;
    lng = tmp;
    if (lng > 0) lng = -lng;
  }

  return { lat, lng };
}

// Client-only mini map (prevents SSR leaflet issues)
const AdminMiniMap = dynamic(() => import('../components/AdminMiniMap'), { ssr: false });

// ---- Component -------------------------------------------------------------

export default function Admin() {
  // Auth/session
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');

  // Partners state
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
    status: 'active' as 'active' | 'paused' | 'ended',
    is_public: true,
  });

  // Collabs state
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [editingCollabId, setEditingCollabId] = useState<string | null>(null);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [collabForm, setCollabForm] = useState({
    name: '',
    tag: '',
    link: '',
    description: '',
    status: 'active' as 'active' | 'paused' | 'ended',
    color: '#2563eb',
  });

  // Auth wiring
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) =>
      setSession(sess)
    );
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Load data once logged in
  useEffect(() => {
    if (!session) return;
    loadPartners();
    loadCollabs();
  }, [session]);

  async function signIn() {
    if (!email) return alert('Enter email');
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert(error.message);
    else alert('Check your email for the magic link.');
  }

  // ---- Partners CRUD -------------------------------------------------------

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
      // Coordinates
      let lat: number;
      let lng: number;

      const hasLatLng =
        form.lat != null &&
        String(form.lat).trim() !== '' &&
        form.lng != null &&
        String(form.lng).trim() !== '';

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

      const { error } = await supabase.from('partners').insert(payload);
      if (error) throw error;

      resetForm();
      await loadPartners();
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to save partner.');
    }
  }

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
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function updatePartner() {
    if (!editingId) return;
    try {
      let lat: number;
      let lng: number;

      const hasLatLng =
        form.lat != null &&
        String(form.lat).trim() !== '' &&
        form.lng != null &&
        String(form.lng).trim() !== '';

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
      resetForm();
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
    const { error } = await supabase.from('partners').update({ collab: newCollab }).eq('id', p.id);
    if (error) return alert(error.message);
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
    if (!confirm(`Delete "${p.name}" permanently? This cannot be undone.`)) return;
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

  // ---- Collabs CRUD --------------------------------------------------------

  async function loadCollabs() {
    const { data, error } = await supabase.from('collabs').select('*').order('name', { ascending: true });
    if (error) {
      console.error('loadCollabs error:', error);
      alert(error.message);
      return;
    }
    setCollabs((data || []) as any);
  }

  async function saveCollab() {
    try {
      const base: any = {
        name: collabForm.name?.trim(),
        tag: collabForm.tag?.trim() || null,
        link: collabForm.link?.trim() || null,
        description: collabForm.description?.trim() || null,
        status: collabForm.status,
        color: collabForm.color || null,
      };

      const creating = !editingCollabId;
      const id = creating ? makeUUID() : (editingCollabId as string);
      if (!id) {
        alert('Internal error: missing collab id.');
        return;
      }

      const payload = { ...base, id };
      console.log('[saveCollab] upsert payload:', payload);

      const { data: row, error: cErr } = await supabase
        .from('collabs')
        .upsert([payload])
        .select()
        .single();
      if (cErr) throw cErr;

      // Sync members
      await supabase.from('collab_members').delete().eq('collab_id', row.id);
      if (selectedPartnerIds.length) {
        const rows = selectedPartnerIds.map((pid) => ({ collab_id: row.id, partner_id: pid }));
        const { error: mErr } = await supabase.from('collab_members').insert(rows);
        if (mErr) throw mErr;
      }

      // Reset
      setEditingCollabId(null);
      setCollabForm({ name: '', tag: '', link: '', description: '', status: 'active', color: '#2563eb' });
      setSelectedPartnerIds([]);
      await loadCollabs();
    } catch (e: any) {
      console.error('saveCollab error:', e);
      alert(e.message || 'Failed to save collab');
    }
  }

  function beginEditCollab(c: Collab, memberIds: string[]) {
    setEditingCollabId(c.id);
    setCollabForm({
      name: c.name || '',
      tag: c.tag || '',
      link: c.link || '',
      description: c.description || '',
      status: c.status || 'active',
      color: c.color || '#2563eb',
    });
    setSelectedPartnerIds(memberIds);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteCollab(c: Collab) {
    if (!confirm(`Delete collab "${c.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from('collabs').delete().eq('id', c.id);
    if (error) {
      console.error('deleteCollab error:', error);
      alert(error.message);
      return;
    }
    await loadCollabs();
  }

  // ---- Render (only JSX below this line) -----------------------------------

  if (!session) {
    return (
      <>
        <Head>
          <title>CollabUs Admin — Sign In</title>
        </Head>
        <main className="container">
          <h1>Admin Sign In</h1>
          <p className="small">Enter your email to receive a one-time login link.</p>
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
        <p className="small">Add new partners, update status, hide/show on the public map, or delete.</p>

        {/* Add/Edit Partner */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3>{editingId ? 'Edit Partner' : 'Add Partner'}</h3>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                onChange={(e) => setForm({ ...form, is_public: e.target.value === 'yes' })}
              >
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
            <button className="btn" onClick={editingId ? updatePartner : savePartner}>
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

        {/* Partners List */}
        <div className="card">
          <h3>Existing Partners</h3>
          {partners.length === 0 && <p className="small">No partners yet.</p>}

          {partners.map((p) => (
            <div key={p.id} className="card" style={{ marginBottom: '.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                  <button className="btn" style={{ background: '#991B1B' }} onClick={() => deletePartner(p)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Collabs Panel */}
        <div className="card" style={{ marginTop: '2rem' }}>
          <h3>{editingCollabId ? 'Edit Collab' : 'Add Collab'}</h3>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label>Name</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={collabForm.name}
                onChange={(e) => setCollabForm({ ...collabForm, name: e.target.value })}
                placeholder="e.g., Pizza ↔ Dessert Night"
              />
            </div>

            <div>
              <label>Tag (unique handle)</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={collabForm.tag}
                onChange={(e) => setCollabForm({ ...collabForm, tag: e.target.value })}
                placeholder="e.g., movie-night"
              />
            </div>

            <div>
              <label>Link</label>
              <input
                className="pill"
                style={{ width: '100%' }}
                value={collabForm.link}
                onChange={(e) => setCollabForm({ ...collabForm, link: e.target.value })}
                placeholder="https://…"
              />
            </div>

            <div>
              <label>Status</label>
              <select
                className="pill"
                style={{ width: '100%' }}
                value={collabForm.status}
                onChange={(e) => setCollabForm({ ...collabForm, status: e.target.value as any })}
              >
                <option value="active">active</option>
                <option value="paused">paused</option>
                <option value="ended">ended</option>
              </select>
            </div>

            <div style={{ gridColumn: '1 / span 2' }}>
              <label>Description</label>
              <textarea
                className="pill"
                style={{ width: '100%', minHeight: 80 }}
                value={collabForm.description}
                onChange={(e) => setCollabForm({ ...collabForm, description: e.target.value })}
                placeholder="Describe the PoP rule, campaign concept, etc."
              />
            </div>

            <div>
              <label>Color</label>
              <input
                className="pill"
                type="color"
                style={{ width: 80, height: 40, padding: 0, cursor: 'pointer' }}
                value={collabForm.color}
                onChange={(e) => setCollabForm({ ...collabForm, color: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <label>Members (check all participating partners)</label>
            <div className="card" style={{ maxHeight: 240, overflowY: 'auto', padding: 8 }}>
              {partners.map((p) => (
                <label
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPartnerIds.includes(p.id)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedPartnerIds([...selectedPartnerIds, p.id]);
                      else setSelectedPartnerIds(selectedPartnerIds.filter((id) => id !== p.id));
                    }}
                  />
                  <span>{p.name}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button className="btn" onClick={saveCollab}>
              {editingCollabId ? 'Update Collab' : 'Save Collab'}
            </button>
            {editingCollabId && (
              <button
                className="btn secondary"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setEditingCollabId(null);
                  setCollabForm({
                    name: '',
                    tag: '',
                    link: '',
                    description: '',
                    status: 'active',
                    color: '#2563eb',
                  });
                  setSelectedPartnerIds([]);
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Collabs list */}
        <div className="card" style={{ marginTop: '1rem' }}>
          <h3>Existing Collabs</h3>
          {collabs.length === 0 && <p className="small">No collabs yet.</p>}
          <div style={{ display: 'grid', gap: 8 }}>
            {collabs.map((c) => (
              <div
                key={c.id}
                className="card"
                style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  <div className="small">
                    Tag: {c.tag || '—'} • Status: {c.status} {c.color ? `• Color: ${c.color}` : ''}
                  </div>
                  {c.link && (
                    <div className="small">
                      <a href={c.link} target="_blank" rel="noreferrer">
                        Link
                      </a>
                    </div>
                  )}
                  {c.description && <div className="small" style={{ opacity: 0.8 }}>{c.description}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn secondary"
                    onClick={async () => {
                      // fetch member ids for this collab then begin edit
                      const { data: ms } = await supabase
                        .from('collab_members')
                        .select('partner_id')
                        .eq('collab_id', c.id);
                      const ids = (ms || []).map((r: any) => r.partner_id);
                      beginEditCollab(c, ids);
                    }}
                  >
                    Edit
                  </button>
                  <button className="btn" style={{ background: '#991B1B' }} onClick={() => deleteCollab(c)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
