
# CollabUs.io — Map + Directory (Supabase Edition)

A production-ready starter for a public, mobile-first map of CollabUs collaborations with:
- Leaflet (OpenStreetMap tiles) map
- 'Near me' sorting via optional geolocation
- Filters for category and status
- Partner cards with PoP rules and directions
- Supabase: database, auth, RLS, and admin dashboard

## Quick start
```bash
npm install
npm run dev
# open http://localhost:3000
```

## Supabase setup
1. Create a project at supabase.com
2. Open the SQL editor and run `supabase/schema.sql`
3. Copy your project URL + anon key into `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
4. Restart `npm run dev`

## Admin
- Visit `/admin`
- Enter your email to receive a magic link via Supabase Auth
- Add/edit partners; toggle status; toggle visibility

## Deploy
- Push to GitHub and import the repo into Vercel or Netlify
- Add environment variables in the project settings
- Add your custom domain (CollabUs.io)

Enjoy!
