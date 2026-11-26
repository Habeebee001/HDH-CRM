# Deploying HDH CRM — Railway + Neon

HDH CRM runs as **one Railway service** (the app, its API and file storage)
connected to **one Neon database**. There are no other services to set up.

```
Browser ──► Railway service (Dockerfile)                 ──► Neon Postgres
            ├─ the HDH CRM web app                            ├─ CRM data
            ├─ sign-in, invitations, password resets          ├─ users & sessions
            ├─ data API (PostgREST, row level security)       └─ uploaded files
            └─ uploads (avatars, logos, attachments)
```

The schema is created automatically on the first start. Nothing to run by hand.

---

## 1. Create the Neon database (5 minutes)

1. Sign in at <https://neon.com> and click **New project**.
2. Name it `hdh-crm`, keep the default Postgres version (17 and 18 are both
   tested), and pick the region closest to
   your team. From Nigeria, **AWS Europe (Frankfurt)** or **AWS Europe
   (London)** are the closest.
3. Leave **Neon Auth** and the **Data API** turned off: HDH CRM brings its own.
4. Click **Connect** on the project dashboard and copy the connection string.
   It looks like this:

   ```
   postgresql://neondb_owner:••••••@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   Either the direct or the pooled string works. Keep it secret: it is the
   key to all your data.

## 2. Put the code on GitHub

Everything is already committed on the `main` branch (Atomic CRM's history is
kept as the `upstream` remote, to pull its future improvements). Create an
empty **private** repository on GitHub (e.g. `hdh-crm`), then from this folder:

```sh
git remote add origin https://github.com/<you>/hdh-crm.git
git push -u origin main
```

## 3. Create the Railway service

1. Sign in at <https://railway.com> → **New project** → **Deploy from GitHub
   repo** → choose `hdh-crm`. Railway finds the `Dockerfile` and builds it
   (the first build takes about 5 minutes).
2. Open the service → **Variables** → add:

   | Variable       | Value                                                        |
   | -------------- | ------------------------------------------------------------ |
   | `DATABASE_URL` | the Neon connection string from step 1                      |
   | `ADMIN_EMAIL`  | your email: only it can create the first (admin) account    |

3. **Settings → Networking → Generate domain**. If Railway asks for a port,
   enter `8080`.
4. **Settings → Deploy → Healthcheck path**: `/healthz`.
5. **Settings → Deploy → Region**: choose the one closest to your Neon region
   (e.g. **EU West** with Neon Frankfurt/London).

Railway redeploys after each change. When the deployment is green, open the
domain.

### No GitHub? Deploy from your computer instead (steps 2–3)

With [Node.js](https://nodejs.org) installed, from this folder:

```sh
npm install -g @railway/cli
railway up -y --name hdh-crm          # signs you in, creates the project, deploys
railway variable set DATABASE_URL='postgresql://neondb_owner:…'   # your Neon string
railway variable set ADMIN_EMAIL=you@yourcompany.com              # your email
railway domain                        # prints your https://….up.railway.app address
```

Then set the healthcheck path and region in the dashboard as above. Run
`railway up` again after each change.

## 4. First sign-in

The first person to open the app creates the **administrator** account.
With `ADMIN_EMAIL` set, only that address can do it, so nobody can claim the
app before you. Then add the team in either of two ways:

- **Invite them**: **Users → New user**, pick their role.
- **Let them ask**: teammates click **Create an account** on the sign-in
  page. Their request waits for you: you get an email (once email is set up),
  a badge on **Users**, and the request at the top of the Users page. Click
  **Approve…**, pick their role and workspaces, and they can sign in (they
  are emailed). **Decline** deletes the request. Until approved, a request
  sees nothing.

- **Without email set up** (the default): after creating a user, the Users
  page shows their invitation link. Copy it or share it on WhatsApp. The
  link works once and expires after 7 days. If someone forgets their
  password, open them in **Users** and click **Password link**.
- **With email set up** (below): invitations and password resets are emailed.

### Roles

| Role          | Sees and edits                                                                 |
| ------------- | ------------------------------------------------------------------------------ |
| **Admin**     | everything, in every workspace; manages users, workspaces, settings and the weekly summary |
| **Manager**   | every contact, company and deal of their workspaces                            |
| **Sales rep** | only *their own* contacts and deals (and their notes and tasks); companies are shared but only their owner, managers and admins change them |

Change a role in **Users** → the person → *Role*. The database enforces the
rule, so a sales rep can't reach other people's records even through the API.
There is always at least one active admin.

### Weekly summary email

Every Monday at 08:00 (Lagos time) the CRM emails a summary of the past week
(revenue won, new deals and contacts, open pipeline, biggest deals, team
activity, per workspace) to `ADMIN_EMAIL`. **Weekly summary** in the side menu
shows a preview and sends a test. It needs email to be set up (below).

### Amounts

All amounts are in **US dollars**. The naira amounts entered before this
change were converted once at 1 USD = 1,550 NGN. Imported files with a naira
column (₦, NGN, "naira" in the header) or naira cells are converted at the
same rate.

### Workspaces (branches or businesses)

Each workspace has its own contacts, companies, deals, notes, tasks and tags.
The data you had before workspaces existed is in **Main workspace** (rename
it as you like).

- **Switch** with the workspace button next to the logo (top left; top of
  the screen on phones).
- **Create, rename, delete** (administrators): workspace button → **Manage
  workspaces**, or the user menu → **Workspaces**. Only an empty workspace
  can be deleted, and there is always at least one.
- **Who sees what**: administrators open every workspace. Other users open
  the workspaces ticked for them (**Manage workspaces** → pencil → *Who can
  open it*). A new user gets the workspace they were invited from.

The database itself enforces this: a user can never read or change the data
of a workspace they were not given.

### Importing files

**Import file** (on Contacts, Companies and Deals) accepts any table file:
Excel (.xlsx, .xls), CSV, OpenDocument (.ods), Apple Numbers and
tab-separated text. Records go into the workspace you are in. Common column
names ("Customer Name", "Phone No", "Deal Name", "Value", "Status"…) are
recognised, title rows above the column names are skipped, and in a workbook
the sheet that looks most like the chosen list is imported.

---

## Optional settings

All are Railway **Variables** on the service.

### Send emails (weekly summary, account requests, invitations, password resets)

**Brevo** (free: 300 emails a day):

1. Create an account at [brevo.com](https://www.brevo.com).
2. **Senders, domains & dedicated IPs → Senders**: add and verify the address
   the emails come from (Brevo emails it a confirmation link).
3. **SMTP & API → SMTP**: note the *SMTP login* and create an *SMTP key*.
4. Set these Railway variables, then redeploy:

| Variable      | Brevo value                                   |
| ------------- | --------------------------------------------- |
| `SMTP_HOST`   | `smtp-relay.brevo.com`                        |
| `SMTP_PORT`   | `587`                                         |
| `SMTP_USER`   | the SMTP login (looks like `8a1b2c001@smtp-brevo.com`) |
| `SMTP_PASS`   | the SMTP key                                  |
| `SMTP_FROM`   | the verified sender, e.g. `HDH CRM <you@gmail.com>` |
| `APP_URL`     | the app address, e.g. `https://hdh-crm-production.up.railway.app` (for the links in emails) |

Any other SMTP provider works the same way: Google Workspace / Gmail (with an
[app password](https://myaccount.google.com/apppasswords), host
`smtp.gmail.com`, port 465), Zoho, Resend, Postmark…

### Use your own domain

Railway → **Settings → Networking → Custom domain** (e.g. `crm.yourcompany.com`),
add the CNAME record it shows at your DNS provider, then set
`APP_URL=https://crm.yourcompany.com` so emailed links use it.

### Other variables

| Variable             | Default | Purpose                                                   |
| -------------------- | ------- | --------------------------------------------------------- |
| `APP_NAME`           | HDH CRM | Name used in emails and link pages                       |
| `ADMIN_EMAIL`        | (none)  | Only this address can create the first (admin) account; anyone can if unset |
| `JWT_SECRET`         | auto    | Session signing key (32+ characters). Generated and stored in the database if unset. |
| `JWT_EXPIRY`         | 3600    | Session token lifetime in seconds (refreshed automatically) |
| `INVITE_TTL_HOURS`   | 168     | Invitation links validity (7 days)                       |
| `RECOVERY_TTL_HOURS` | 24      | Password reset links validity                             |
| `MIN_PASSWORD_LENGTH`| 8       | Minimum password length                                   |
| `MAX_UPLOAD_MB`      | 20      | Maximum size of one uploaded file                         |
| `WEEKLY_SUMMARY`     | on      | `off` stops the weekly summary email                      |
| `WEEKLY_SUMMARY_TO`  | `ADMIN_EMAIL` | Who gets the weekly summary (comma-separated); the admins if neither is set |

---

## Day-to-day

- **Updates**: push to GitHub and Railway redeploys. New database migrations
  (`server/db/migrations/*.sql`) are applied automatically at start-up.
- **Backups**: Neon keeps a restore window (see your plan), and you can
  branch the database before risky changes. For an extra copy:
  `pg_dump "$DATABASE_URL" > hdh-crm-backup.sql`.
- **Logs**: Railway → service → **Deployments → View logs**. Without email,
  password reset requests are also logged there.
- **Costs**: Neon's free plan is enough to start (the database sleeps when
  nobody uses it, which adds about a second to the first request). Railway
  bills the service by usage on its Hobby plan. Check both sites for
  current prices.

## What changed from Atomic CRM's Supabase version

The browser app is unchanged apart from the HDH design. The Supabase services
it used are provided by `server/` instead:

| Supabase                 | HDH CRM on Neon                                         |
| ------------------------ | ------------------------------------------------------- |
| Auth (GoTrue)            | `server/lib/auth.ts`: same API, users in `auth.users` |
| Data API (PostgREST)     | PostgREST 16, run by the server, same RLS policies     |
| Storage                  | `server/lib/storage.ts`: files kept in `storage.objects` |
| Edge functions           | `server/lib/functions.ts`: users, merge contacts      |
| `http` / `pg_net` (SQL)  | Rewritten: favicons from favicon.show, attachment clean-up in SQL |

Not ported: inbound email capture (Postmark), the MCP server for AI
assistants, Google Workspace SSO and Gravatar avatars. They can be added
later.
