'use client';

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

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
    const { error } = await supabase.from('partners').insert(payload);
    if (error) return alert(error.message);
    resetForm();
    await loadPartners();
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
