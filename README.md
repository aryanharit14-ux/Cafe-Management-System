# Juniper Coffee & Company

A working café ordering project with a responsive React storefront, Express API and MongoDB Atlas database. Cream, forest green, editorial type and locally bundled café photography give Juniper its own identity.

## Run

Use Node.js **22.13 or newer** (Node 24+ recommended). From this directory, or the workspace root:

```sh
npm run setup   # first time only, if dependencies are missing
cp backend/.env.example backend/.env  # fresh checkout only; fill MONGO_URI
npm run build
npm start
```

Open http://localhost:5002. One Node process serves the production frontend, API and Socket.IO. MongoDB Atlas stores the application data. Set a database-user connection string in `backend/.env` and allow the backend IP in Atlas Network Access. Docker, PostgreSQL and a local MongoDB installation are not required. The server stops if Atlas is unavailable; it never silently falls back to local storage.

For development with React hot reload:

```sh
npm run dev
```

The development frontend is on http://localhost:5174 and proxies `/api` and `/socket.io` to the backend port from `backend/.env` (5002 by default). Stop an already running production server before running `npm run dev`.

## Phone and laptop

The server binds to `0.0.0.0`. Keep the laptop running and connect the phone to the same Wi-Fi. On the phone, open `http://YOUR_LAPTOP_LAN_IP:5002`. Find the laptop's Wi-Fi address in its network settings. Firewall restrictions or Wi-Fi client isolation may prevent device-to-device access. `localhost` on a phone refers to the phone, not the laptop.

The site has dedicated layouts at phone, tablet and laptop sizes, touch controls, horizontal category scrolling, native accessible customization dialogs, visible keyboard focus and reduced-motion support.

## Staff access

There are **no shared default staff credentials**. Create your own staff account:

```sh
npm run admin
```

Enter a valid email and password of at least 10 characters. The terminal prompt warns that the password is visible while typing. Sign in at `/login`; the Staff navigation item opens `/admin`. The command can also promote an existing account and replace its password.

Optional bootstrap environment variables `ADMIN_EMAIL` and `ADMIN_PASSWORD` are supported. If supplied, they set the staff account password on startup, so remove them after provisioning. Public registration always creates customer accounts.

## Working features

- Seeded menu with 36 items, eight categories, search, price sorting and availability.
- Drink size and milk customization, with prices verified by the server.
- Saved basket, quantity changes, café selection, dine-in/takeaway and barista notes.
- Registration, sign-in, session expiry, server-side logout and protected customer pages.
- Pay-at-counter and Razorpay online checkout with duplicate-submission protection.
- Verified online payments, webhook recovery, pending-payment status checks and staff refund indicators. See [Razorpay setup](PAYMENTS.md).
- Live order and menu updates through Socket.IO, with reconnection refresh and 15-second order polling when disconnected. Order events are restricted to the customer and staff; logout revokes the socket session.
- Staff order queue, revenue summary, menu creation/editing/deletion and availability controls.
- Enforced order lifecycle: received → preparing → ready → completed, with cancellation before completion.
- Club leaf balance calculated from completed orders; 1 leaf per ₹10. This is milestone tracking, not a redeemable currency.
- Story, locations and account pages, useful empty/error/loading states and 404 handling.

## Persistence and configuration

Users, sessions, menu, orders and payment attempts are stored in the dedicated `juniper_cafe` MongoDB Atlas database. Order items and checkout snapshots are native embedded documents. Unique indexes prevent duplicate email accounts, checkout keys and payment IDs; MongoDB transactions keep confirmed payments and café orders consistent. Expired sessions are rejected immediately and removed by a TTL index.

The browser keeps only the basket, selected café, checkout request key and sign-in token locally. Clearing browser storage does not remove accounts or orders from Atlas.

```dotenv
PORT=5002
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/juniper_cafe?retryWrites=true&w=majority
# Optional override: MONGO_DB_NAME=juniper_cafe
```

Use the Atlas **database user's** password, URL-encode reserved characters in credentials, and keep `.env` private. Choose a database user with read/write access to this café database. Never put the URI in frontend code.

`npm run db:migrate` imports the previous `backend/data/juniper.sqlite` database into an empty Atlas database. It preserves IDs, password hashes, sessions, edited menu items and order/payment records. It refuses to overwrite an occupied database and leaves the SQLite source intact. Run this before the first server start when preserving legacy data. Repeated imports are skipped after a successful import. Normal startup seeds the menu once and does not recreate staff-deleted items.

For deployment, use a Node host with HTTPS and WebSocket support, configure `MONGO_URI` and the host's `PORT`, allow the host's outbound IP in Atlas, then run `npm run setup`, `npm run build` and `npm start`. A persistent local volume and Docker are unnecessary. This setup uses one backend instance for live notifications; multiple instances require a shared Socket.IO adapter. A static-only host cannot run the ordering API. Configure Atlas backups appropriate to your hosting tier.

## Checks

```sh
npm test
npm run build
```

Tests use disposable MongoDB replica sets and local servers, entirely separate from Atlas. On the first run, the test helper downloads a MongoDB binary; it does not require Docker. It covers registration and login, duplicate accounts, account roles, unauthorized access, price tampering, invalid quantities/options, unavailable items, idempotent checkout, order ownership, order-status transitions, menu CRUD, logout and database persistence after reopening.

Browser verification was performed at 1440px and 390px widths: menu search, product dialog, basket, registration with checkout return, order placement, staff status changes and staff menu creation. No horizontal overflow was observed at 390px and no browser console errors were observed during these flows. Physical phone testing depends on your local network.

## Atlas migration verification (19 November 2026)

The legacy menu (36 items) was imported into `juniper_cafe`; there were no legacy users or orders. The original SQLite files remain as a backup. The active application uses Atlas exclusively, with no PostgreSQL or Docker requirement.

All 10 integration tests pass, including concurrent counter checkout, signed payment callback/webhook races, refunds, persistence, menu edits, and Socket.IO ownership/logout checks. The production build succeeds. The production backend dependency audit reports zero known vulnerabilities. Frontend lint has warnings in the active components, with no errors.

The Atlas health endpoint reports `database: mongodb` and `realtime: true`. Menu search and all 36 products were checked at 390px and 1440px widths without horizontal overflow or browser console errors. Real Razorpay payments remain disabled until merchant credentials are supplied. No real payment was made.

If Atlas stops connecting after a network change, check **Database & Network Access → IP Access List → Add Current IP Address**, wait until Active, and restart the backend. Keep TLS verification enabled. [Atlas connection troubleshooting](https://www.mongodb.com/docs/atlas/troubleshoot-connection/).

## Scope

This is a functioning local project, not a publicly deployed café business. The two café locations are explicitly marked as samples. Pay-at-counter works immediately. Razorpay online payments are implemented but require merchant keys and payment-provider setup. Transactional email, password recovery and redeemable rewards are not connected. Replace the sample locations, product claims and prices before commercial use. Deploy behind HTTPS before collecting real customer credentials over the internet.

## Source map

- `frontend/src/jsx/App.jsx`: storefront, account, checkout and staff UI.
- `frontend/src/css/index.css`: responsive visual system.
- `frontend/public/images/`: bundled photography.
- `backend/app.js`: active API, MongoDB storage, sessions and validation.
- `backend/catalog.js`: 36-item menu seed.
- `backend/checkout.js`: shared server-side checkout validation.
- `backend/payments.js`: payment attempts, verification, recovery and webhooks.
- `backend/razorpay.js`: server-only Razorpay HTTP adapter and signature checks.
- `frontend/src/js/razorpay.js`: hosted Checkout script loading and payment window.
- `backend/db/mongo.js`: Atlas connection and transaction support.
- `backend/db/schema.js`: indexes and one-time catalog seeding.
- `backend/db/import-sqlite.js`: optional legacy import.
- `backend/realtime.js`: authenticated Socket.IO rooms.
- `backend/server.js`: server startup.
- `backend/create-admin.js`: staff provisioning.
- `backend/test/app.test.js`: integration coverage.

Unused files from the original implementation have been removed. The source map above describes the active application; the SQLite import utility and original database backup are retained for migration and recovery.

## Image credits

Photos are downloaded from Unsplash and Pexels and bundled locally. Product photography is representative. Source photo identifiers: `photo-1442512595331-e89e73853f31` (coffee), `photo-1541167760496-1628856ab772` (latte), `photo-1517701604599-bb29b565090c` (cold brew), `photo-1515823064-d6e0c04616a7` (matcha), `photo-1555507036-ab1f4038808a` (croissant), `photo-1525351484163-7529414344d8` (toast), `photo-1499636136210-6f4ee915583e` (cookie). Additional Unsplash photos: `photo-1544787219-7f47ccb76574` (tea), `photo-1528735602780-2552fd46c7af` (sandwich), `photo-1607958996333-41aef7caefaa` (muffin), `photo-1533134242443-d4fd215305ad` (cheesecake). Refresher: [Nasim Didar on Pexels](https://www.pexels.com/photo/cold-drink-with-lemon-and-mint-9584965/). Google Fonts supplies DM Sans and Playfair Display; system fallbacks work if font loading is unavailable.

Additional Pexels photographs: [brownies](https://www.pexels.com/photo/close-up-shot-of-brownies-14576527/) and [walnut banana bread](https://www.pexels.com/photo/brown-sliced-bread-on-white-surface-5419313/).
