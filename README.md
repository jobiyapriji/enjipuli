# ഇഞ്ചിപ്പുളി (Enjipuli)

**ക്യാമ്പ്സ്ന്റെ ഹോട്ട്സ്പോട്ട്** — Online ordering system for a college campus food truck.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: SQLite (local dev) / PostgreSQL (production via Prisma ORM)
- **Auth**: NextAuth.js — email-based login for students & vendor staff
- **Payments**: Razorpay (test mode — swap env vars for production)
- **QR Codes**: `qrcode` (generate) + `html5-qrcode` (vendor camera scanner)
- **Deployment**: Vercel + Neon/Supabase managed Postgres

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Student home — live menu + cart
│   ├── login/page.tsx            # Student login
│   ├── orders/page.tsx           # Order history
│   ├── order/[id]/page.tsx       # Order confirmation + QR + live tracker
│   ├── vendor/
│   │   ├── login/page.tsx        # Vendor login
│   │   ├── queue/page.tsx        # Kanban order queue
│   │   ├── scan/page.tsx         # Camera QR scanner
│   │   ├── stock/page.tsx        # Daily stock management
│   │   └── summary/page.tsx      # Daily analytics
│   └── api/
│       ├── auth/[...nextauth]/   # NextAuth handler
│       ├── menu/                 # GET menu items with live stock
│       ├── checkout/             # POST — atomic stock reservation
│       ├── payment/verify/       # POST — Razorpay signature verification
│       ├── orders/[id]/          # GET single order
│       ├── orders/               # GET order list (student/vendor)
│       ├── stock/                # POST — vendor stock update
│       └── vendor/
│           ├── status/           # POST — advance order status
│           └── deliver/          # POST — QR scan delivery confirmation
├── components/
│   ├── Header.tsx                # Global header with LogoWordmark slot
│   ├── LogoWordmark.tsx          # SVG wordmark slot (swap in Stitch SVG)
│   └── Providers.tsx             # NextAuth SessionProvider
└── lib/
    ├── auth.ts                   # NextAuth config
    └── prisma.ts                 # Prisma client singleton
prisma/
├── schema.prisma                 # DB schema
└── seed.ts                       # Seed script (menu items + vendor account)
STITCH_INTEGRATION.md             # Design integration reference for Stitch
```

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in your values:
```bash
cp .env.example .env
```

### 3. Push database schema
```bash
npx prisma db push
```

### 4. Seed sample data
```bash
npx tsx prisma/seed.ts
```

### 5. Run development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

See `.env.example` for all required variables.

| Variable | Description |
|---|---|
| `DATABASE_URL` | `file:./dev.db` for SQLite, or Postgres URL for prod |
| `NEXTAUTH_SECRET` | Random secret for JWT signing |
| `NEXTAUTH_URL` | Base URL (e.g. `http://localhost:3000`) |
| `RAZORPAY_KEY_ID` | Razorpay API key (test: `rzp_test_…`) |
| `RAZORPAY_KEY_SECRET` | Razorpay API secret |
| `RESEND_API_KEY` | Resend API key for sending login OTP emails (console fallback when blank) |
| `RESEND_FROM_EMAIL` | Verified sender address (e.g. `ENJIPULI <login@yourdomain.com>`) |

---

## Test Credentials

- **Vendor**: `vendor@enjipuli.com`
- **Student**: Any valid email address (e.g. `student@gmail.com` or campus email)

---

## Stitch Design Integration

See [`STITCH_INTEGRATION.md`](./STITCH_INTEGRATION.md) for the stable contract between the backend and the Google Stitch design output — CSS tokens, element IDs, API shapes, and the SVG wordmark swap instructions.

---

## Deployment (Vercel + Neon/Supabase)

1. Create a Postgres database on [Neon](https://neon.tech) or [Supabase](https://supabase.com).
2. Set `DATABASE_URL` to the Postgres connection string in Vercel environment variables.
3. Update `prisma/schema.prisma` datasource provider from `sqlite` to `postgresql`.
4. Deploy: `vercel deploy`
5. Run migrations: `npx prisma db push` against the production DB.
