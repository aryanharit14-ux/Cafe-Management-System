# Juniper Coffee & Company

A working café ordering project with a responsive React storefront, Express API and persistent SQLite database. Cream, forest green, editorial type and locally bundled café photography give Juniper its own identity.

## Run

Use Node.js **22.13 or newer** (Node 24+ recommended for built-in SQLite). From this directory, or the workspace root:

```sh
npm run setup   # first time only, if dependencies are missing
npm run build
npm start
```

Open http://localhost:5001. One Node process serves the production frontend and API. No MongoDB account, separate database installation, API key or payment service is needed.

For development with React hot reload:

```sh
npm run dev
```

The development frontend is on http://localhost:5173 and proxies `/api` to port 5001. Stop an already running production server before running `npm run dev`.

## Phone and laptop

The server binds to `0.0.0.0`. Keep the laptop running and connect the phone to the same Wi-Fi. On the phone, open `http://YOUR_LAPTOP_LAN_IP:5001`. Find the laptop's Wi-Fi address in its network settings. Firewall restrictions or Wi-Fi client isolation may prevent device-to-device access. `localhost` on a phone refers to the phone, not the laptop.

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
- Order history and 15-second status refresh.
- Staff order queue, revenue summary, menu creation/editing/deletion and availability controls.
- Enforced order lifecycle: received → preparing → ready → completed, with cancellation before completion.
- Club leaf balance calculated from completed orders; 1 leaf per ₹10. This is milestone tracking, not a redeemable currency.
- Story, locations and account pages, useful empty/error/loading states and 404 handling.

## Persistence and configuration

By default, users, sessions, menu and orders are stored in `backend/data/juniper.sqlite`. The database and `.env` files are ignored by Git. Keep this directory on a persistent disk and back it up. Existing MongoDB data is untouched; it is not automatically migrated.

Optional variables in `backend/.env`:

```dotenv
PORT=5001
# DATABASE_PATH=/absolute/path/on/persistent-disk/juniper.sqlite
```

For deployment, use a Node host with a persistent volume and HTTPS, run `npm run setup`, `npm run build`, then `npm start`. Set `PORT` to the host's assigned port and `DATABASE_PATH` to the persistent volume. This SQLite implementation is intended for one app instance; do not run replicas against separate local databases. A static-only host cannot run the ordering API.

## Checks

```sh
npm test
npm run build
```

The integration test uses an isolated temporary database and local server. It covers registration and login, duplicate accounts, account roles, unauthorized access, price tampering, invalid quantities/options, unavailable items, idempotent checkout, order ownership, order-status transitions, menu CRUD, logout and database persistence after reopening.

Browser verification was performed at 1440px and 390px widths: menu search, product dialog, basket, registration with checkout return, order placement, staff status changes and staff menu creation. No horizontal overflow was observed at 390px and no browser console errors were observed during these flows. Physical phone testing depends on your local network.

## Scope

This is a functioning local project, not a publicly deployed café business. The two café locations are explicitly marked as samples. Pay-at-counter works immediately. Razorpay online payments are implemented but require merchant keys and payment-provider setup. Transactional email, password recovery and redeemable rewards are not connected. Replace the sample locations, product claims and prices before commercial use. Deploy behind HTTPS before collecting real customer credentials over the internet.

## Source map

- `frontend/src/jsx/App.jsx`: storefront, account, checkout and staff UI.
- `frontend/src/css/index.css`: responsive visual system.
- `frontend/public/images/`: bundled photography.
- `backend/app.js`: active API, SQLite storage, sessions and validation.
- `backend/catalog.js`: 36-item menu seed.
- `backend/checkout.js`: shared server-side checkout validation.
- `backend/payments.js`: payment attempts, verification, recovery and webhooks.
- `backend/razorpay.js`: server-only Razorpay HTTP adapter and signature checks.
- `frontend/src/js/razorpay.js`: hosted Checkout script loading and payment window.
- `backend/server.js`: server startup.
- `backend/create-admin.js`: staff provisioning.
- `backend/test/app.test.js`: integration coverage.

The original MongoDB models/controllers/routes and older React page components remain as reference files but are not imported by the new application entry points. The earlier CHO syllabus mapping describes that original implementation, not this SQLite version.

## Image credits

Photos are downloaded from Unsplash and Pexels and bundled locally. Product photography is representative. Source photo identifiers: `photo-1442512595331-e89e73853f31` (coffee), `photo-1541167760496-1628856ab772` (latte), `photo-1517701604599-bb29b565090c` (cold brew), `photo-1515823064-d6e0c04616a7` (matcha), `photo-1555507036-ab1f4038808a` (croissant), `photo-1525351484163-7529414344d8` (toast), `photo-1499636136210-6f4ee915583e` (cookie). Additional Unsplash photos: `photo-1544787219-7f47ccb76574` (tea), `photo-1528735602780-2552fd46c7af` (sandwich), `photo-1607958996333-41aef7caefaa` (muffin), `photo-1533134242443-d4fd215305ad` (cheesecake). Refresher: [Nasim Didar on Pexels](https://www.pexels.com/photo/cold-drink-with-lemon-and-mint-9584965/). Google Fonts supplies DM Sans and Playfair Display; system fallbacks work if font loading is unavailable.

Additional Pexels photographs: [brownies](https://www.pexels.com/photo/close-up-shot-of-brownies-14576527/) and [walnut banana bread](https://www.pexels.com/photo/brown-sliced-bread-on-white-surface-5419313/).
