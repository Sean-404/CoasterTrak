# CoasterTrak MVP

CoasterTrak is an MVP rollercoaster tracking app with:
- Interactive map with park/coaster markers
- Email/password auth
- Wishlist tracking
- Ride logging and personal stats

## Local setup

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `copy .env.example .env.local`
3. Fill values in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Run SQL in Supabase SQL editor:
   - `supabase/schema.sql`
   - `supabase/seed.sql`
5. Start app:
   - `npm run dev`

## Key routes

- `/` - landing page
- `/map` - interactive map with country and name filter
- `/login` - sign up / sign in
- `/wishlist` - user wishlist
- `/stats` - personal stats dashboard
- `/api/health` - health endpoint

## Deploy (Vercel free tier)

1. Import repo in Vercel.
2. Add env vars from `.env.local` in Vercel project settings.
3. Deploy.
4. Validate:
   - user signup/signin
   - map markers visible
   - wishlist and rides saved
   - stats totals update
