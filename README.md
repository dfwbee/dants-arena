# Dants Arena

Dants Arena is a football arena web app for bookings, memberships, events, QR-based access, and admin management.

## What This Project Includes

- Public website pages for home, bookings, memberships, events, login, privacy, and terms
- User authentication with email verification
- User dashboard with profile settings, QR code access, booking history, and membership status
- Admin dashboard tools for events, bookings, users, attendees, and QR verification
- Paystack payment flow for bookings and memberships
- Supabase as the database
- Gmail SMTP for email verification during development/testing

## Project Structure

```text
dants-arena/
├── backend/
│   ├── routes/
│   ├── services/
│   ├── sql/
│   ├── scripts/
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── login.html
│   ├── dashboard.html
│   ├── booking.html
│   ├── membership.html
│   ├── events.html
│   ├── api.js
│   └── ...
└── README.md
```

## Local Setup

### 1. Install backend dependencies

From [`backend`](C:\Users\akore\Desktop\dants-arena\backend):

```powershell
npm install
```

### 2. Create your backend environment file

Create [`backend/.env`](C:\Users\akore\Desktop\dants-arena\backend\.env) using [`backend/.env.example`](C:\Users\akore\Desktop\dants-arena\backend\.env.example) as a template.

Example:

```env
PORT=5000
JWT_SECRET=replace_with_a_real_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
PAYSTACK_SECRET_KEY=your_paystack_secret
FRONTEND_URL=http://localhost:3001
GMAIL_USER=yourgmail@gmail.com
GMAIL_APP_PASSWORD=your_16_character_app_password
EMAIL_FROM=Dants Arena <yourgmail@gmail.com>
```

### 3. Run the required Supabase SQL

Open Supabase SQL Editor and run these files from [`backend/sql`](C:\Users\akore\Desktop\dants-arena\backend\sql):

- [`add-username-to-users.sql`](C:\Users\akore\Desktop\dants-arena\backend\sql\add-username-to-users.sql)
- [`add-email-verification-to-users.sql`](C:\Users\akore\Desktop\dants-arena\backend\sql\add-email-verification-to-users.sql)
- [`add-profile-settings-to-users.sql`](C:\Users\akore\Desktop\dants-arena\backend\sql\add-profile-settings-to-users.sql)
- [`add-admin-ops.sql`](C:\Users\akore\Desktop\dants-arena\backend\sql\add-admin-ops.sql)

Optional:

- [`seed-events.sql`](C:\Users\akore\Desktop\dants-arena\backend\sql\seed-events.sql) if you want the sample events back as real database events

### 4. Start the backend

From [`backend`](C:\Users\akore\Desktop\dants-arena\backend):

```powershell
npm run dev
```

The backend runs on:

```text
http://localhost:5000
```

API base:

```text
http://localhost:5000/api
```

### 5. Run the frontend

Serve the [`frontend`](C:\Users\akore\Desktop\dants-arena\frontend) folder with a local server such as Live Server or any static server.

Expected frontend URL during development:

```text
http://localhost:3001
```

## Gmail Email Verification Setup

This project currently uses Gmail SMTP for verification emails.

To set it up:

1. Turn on 2-Step Verification on the Gmail account
2. Generate a Gmail App Password
3. Put the Gmail address and App Password into [`backend/.env`](C:\Users\akore\Desktop\dants-arena\backend\.env)

Important:

- Do not use your normal Gmail password
- Use the 16-character Gmail App Password instead

## Paystack Setup

This project uses Paystack for:

- booking payments
- membership payments

You need:

- `PAYSTACK_SECRET_KEY` in [`backend/.env`](C:\Users\akore\Desktop\dants-arena\backend\.env)
- `FRONTEND_URL` set correctly so Paystack can redirect back to the live site after payment

## Admin Setup

To create or promote an admin user:

From [`backend`](C:\Users\akore\Desktop\dants-arena\backend):

```powershell
npm run bootstrap-admin -- --email you@example.com --password YourPassword123 --first-name YourFirstName --last-name YourLastName
```

This script will create an admin account if the email does not exist, or promote the existing account to admin.

## Deployment Overview

### GitHub

1. Create a GitHub repository
2. Push this project to GitHub
3. Make sure `.env` files are not committed

### Railway

1. Create a Railway account
2. Connect Railway to the GitHub repository
3. Create a Railway service for the backend
4. Point the service to the `backend` folder
5. Add the backend environment variables in Railway
6. Deploy the backend
7. Get the Railway public backend URL

### Frontend Hosting

You can host the frontend on Railway or another static host such as Vercel or Netlify.

Before deployment, update [`frontend/api.js`](C:\Users\akore\Desktop\dants-arena\frontend\api.js) so:

```js
const API_URL = 'https://your-live-backend-url/api';
```

### Domain Setup with WhoGoHost

If your domain was bought from WhoGoHost:

1. Deploy the frontend and backend first
2. Get the DNS records from your hosting provider
3. Log in to WhoGoHost
4. Open the DNS management for your domain
5. Add the required DNS records there
6. Wait for DNS propagation

## Before Going Live

Test these flows:

- signup
- email verification
- login
- logout
- booking with Paystack
- membership payment with Paystack
- events page and event registration
- QR code generation
- admin tools
- regular user restrictions
- mobile responsiveness

## Notes

- Supabase is the source of truth for users, bookings, memberships, events, and admin data
- Admin access is role-based using the `role` field in the database
- The frontend should never point to localhost after deployment
- The backend must be restarted after changing env values