
import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import type { Map } from 'leaflet'
import { haversineDistance } from '../lib/geo'
import cn from 'classnames'

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })

type Partner = {
  id:string; name:string; category:string[]; address:string;
  lat:number; lng:number; phone?:string; website?:string; instagram?:string;
  collab:{ partnerIds:string[]; popRule:string; code:string; status:'active'|'paused'|'ended' };
  is_public?: boolean;
}

const statusClass = (s:string)=> ({active:'status-active',paused:'status-paused',ended:'status-ended'} as any)[s] || ''

export default function MapView({ partners }:{partners:Partner[]}){
  const [position, setPosition]=useState<{lat:number,lng:number}|null>(null)
  const [category, setCategory]=useState<string>('All')
  const [status, setStatus]=useState<string>('active')
  const [query, setQuery]=useState('')
  const [map, setMap]=useState<Map|null>(null)

  const categories = useMemo(()=> ['All', ...Array.from(new Set(partners.flatMap(p=>p.category)))], [partners])

  const filtered = useMemo(()=>{
    return partners.filter(p=>{
      const matchesCat = category==='All' || p.category.includes(category)
      const matchesStatus = status==='all' ? true : p.collab.status===status
      const matchesQuery = query.trim().length===0 || p.name.toLowerCase().includes(query.toLowerCase()) || p.address.toLowerCase().includes(query.toLowerCase())
      return matchesCat && matchesStatus && matchesQuery
    }).map(p=>{
      const dist = position ? haversineDistance(position, {lat:p.lat,lng:p.lng}) : null
      return {...p, dist}
    }).sort((a,b)=> (a.dist??9999) - (b.dist??9999))
  }, [partners, category, status, query, position])

  const center = position ?? { lat: 39.7589, lng: -84.1916 } // Dayton

  const useMyLocation = ()=>{
    if (!navigator.geolocation) return alert('Geolocation not supported')
    navigator.geolocation.getCurrentPosition(
      (pos)=>{
        const { latitude, longitude } = pos.coords
        setPosition({lat:latitude, lng:longitude})
        if (map) map.flyTo([latitude, longitude], 13)
      },
      ()=> alert('Could not get your location.')
    )
  }

  return (
    <div className="grid">
      <div className="card">
        <div className="toolbar">
          <select className="pill" value={category} onChange={e=>setCategory(e.target.value)}>
            {categories.map(c=> <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="pill" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="ended">Ended</option>
            <option value="all">All</option>
          </select>
          <input className="pill" placeholder="Search name or address" value={query} onChange={e=>setQuery(e.target.value)} />
          <button className="btn secondary" onClick={useMyLocation}>Use my location</button>
        </div>

        <div className="legend">
          <span className={cn('pill', 'status-active')}>Active</span>
          <span className={cn('pill', 'status-paused')}>Paused</span>
          <span className={cn('pill', 'status-ended')}>Ended</span>
        </div>

        <div style={{marginTop:'.5rem'}}>
          {filtered.slice(0,10).map(p=> (
            <div key={p.id} className="card" style={{marginBottom:'.5rem'}}>
              <div style={{display:'flex', justifyContent:'space-between', gap:'1rem', alignItems:'center'}}>
                <div>
                  <div style={{fontWeight:700}}>{p.name}</div>
                  <div className="small">{p.category.join(' • ')}</div>
                  <div className="small">{p.address}</div>
                  <div className="small"><b>PoP:</b> {p.collab.popRule}</div>
                  <div className={cn('pill', statusClass(p.collab.status))} style={{display:'inline-block', marginTop:6}}>{p.collab.status.toUpperCase()}</div>
                  {p.dist!=null && <div className="small" style={{marginTop:4}}>{p.dist.toFixed(2)} km away</div>}
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  {p.website && <a className="btn secondary" href={p.website} target="_blank" rel="noreferrer">Website</a>}
                  <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address)}`} target="_blank" rel="noreferrer">Directions</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="map" id="map">
          <MapContainer center={[center.lat, center.lng]} zoom={12} style={{height:'100%', width:'100%'}} whenCreated={setMap}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filtered.map(p=> (
              <Marker key={p.id} position={[p.lat, p.lng]}>
                <Popup>
                  <div style={{minWidth:200}}>
                    <div style={{fontWeight:700}}>{p.name}</div>
                    <div style={{fontSize:12}}>{p.address}</div>
                    <div style={{fontSize:12, marginTop:4}}><b>PoP:</b> {p.collab.popRule}</div>
                    <div style={{fontSize:12, marginTop:4}}><b>Status:</b> {p.collab.status}</div>
                    {p.website && <div style={{marginTop:6}}><a href={p.website} target="_blank" rel="noreferrer">Website</a></div>}
                    <div style={{marginTop:6}}><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.address)}`} target="_blank" rel="noreferrer">Directions</a></div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}
