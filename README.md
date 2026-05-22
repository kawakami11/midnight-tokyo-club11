# Midnight Tokyo Club Marketplace MVP

Next.js + Supabase reservation marketplace MVP inspired by high-conversion booking directories. It combines a Hot Pepper-style public search and availability flow with an admin reservation desk for premium JDM night tours.

## Included

- Public marketplace home at `/`
- Search filters, category tabs, tour cards, reviews, and live slots
- Rich car image sections for imported cars, supercars, and night-route ambience
- Admin login with Supabase Auth at `/admin`
- Reservation list, date search, status filter, CSV export
- Reservation add, edit, delete
- Customer memo and reservation notes
- Host-specific slots with automatic availability checks
- Multiple stores / locations
- Direct customer booking page at `/customer`
- Cancellation policy display
- Sales analysis by service
- Stripe Checkout route for payments
- LINE notification route
- Automatic reminder route for cron
- Google Calendar event route
- Reservation confirmation with Google Calendar link and `.ics` download
- Demo mode with local browser storage when Supabase env vars are not set

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Start development:

```bash
npm run dev
```

3. Open:

```text
http://localhost:3000
```

Admin:

```text
http://localhost:3000/admin
```

Customer direct booking:

```text
http://localhost:3000/customer
```

## Supabase Setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Copy `.env.example` to `.env.local`.
5. Add:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

When those keys are present, the app switches from demo storage to Supabase.

Demo mode stores reservations in the browser. Supabase mode stores real reservations in PostgreSQL and can trigger server-side integrations.

## Integrations

Stripe:

```bash
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
```

LINE:

```bash
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_ADMIN_TO_ID=...
# Backward-compatible fallback if you already used the old name:
LINE_DEFAULT_USER_ID=...
```

Create a LINE Official Account, enable Messaging API, then use the channel access token.
`LINE_ADMIN_TO_ID` can be a user ID, group ID, or room ID that your LINE Official Account can push to.
When a reservation has `customer.line_user_id`, the app sends to that customer; otherwise it sends to `LINE_ADMIN_TO_ID`.

Google Calendar:

```bash
GOOGLE_CLIENT_EMAIL=...
GOOGLE_PRIVATE_KEY=...
GOOGLE_CALENDAR_ID=...
```

Use a Google Cloud service account with Calendar API enabled. Share the target Google Calendar with `GOOGLE_CLIENT_EMAIL` and give it permission to make changes.
When these values are configured and a store has `google_calendar_enabled = true`, `/api/calendar/create-event` creates or updates an event after reservation confirmation and stores the `google_event_id`. Even without those credentials, the public booking UI shows an Add to Google Calendar link and an ICS download after confirmation.

Reminders:

```bash
CRON_SECRET=...
```

Vercel uses `vercel.json` to call `/api/reminders` hourly. Set the same `CRON_SECRET` in Vercel; Vercel sends it as the `Authorization` header. The route finds reservations around 24 hours before start time and sends LINE reminders when the store has `reminder_enabled = true`.
Netlify can use the same endpoint from an external scheduler by calling `/api/reminders` with `Authorization: Bearer <CRON_SECRET>`.

## Deploy

Vercel:

```bash
npm run build
```

Then set the environment variables in the Vercel dashboard.

Netlify:

The included `netlify.toml` uses `npm run build`, Node 20, and the Netlify Next.js plugin. Set secrets in the Netlify dashboard, not in `netlify.toml`.
