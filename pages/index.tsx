
import Head from 'next/head'
import { useEffect, useState } from 'react'
import MapView from '../components/MapView'
import localPartners from '../data/partners.json'
import { supabase } from '../lib/supabaseClient'

export default function Home(){
  const [partners, setPartners] = useState<any[]>(localPartners as any)

  useEffect(()=>{
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if(!url || !key){ setPartners(localPartners as any); return }
    (async ()=>{
      const { data, error } = await supabase.from('partners').select('*').eq('is_public', true)
      if(!error && data && data.length>0){
        setPartners(data as any)
      } else {
        setPartners(localPartners as any)
      }
    })()
  }, [])

  return (
    <>
      <Head>
        <title>CollabUs.io — Find Collaborative PoP Partners</title>
        <meta name="viewport" content="initial-scale=1, width=device-width" />
      </Head>
      <main className="container">
        <h1>CollabUs Collab Map</h1>
        <p>Discover active two-way Proof-of-Purchase collaborations near you. Share your location to sort by distance.</p>
        <MapView partners={partners as any} />
      </main>
    </>
  )
}
// pages/index.tsx

export async function getServerSideProps() {
  // No data needed at build time; render on request to avoid static prerender issues
  return { props: {} };
}
