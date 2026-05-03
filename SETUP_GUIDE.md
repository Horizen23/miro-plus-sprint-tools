# 🛠️ Setup Guide: Plus Sprint Tools

Complete setup guide for developers (Miro & Atlassian Integration)

---

## 1. Miro App Setup
1.  **Create App**: Go to [Miro Developer Hub](https://miro.com/app/dashboard/?tpApp=devhub) and create a new app.
2.  **App URL**: Set `App URL` to `http://localhost:3000` (for local development).
3.  **Permissions**: Enable the following scopes:
    *   `boards:read`
    *   `boards:write`
4.  **Install**: Click the "Install app and get OAuth token" button to install the app on your test board.

---

## 2. Jira (Atlassian) App Setup
1.  **Create App**: Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/).
2.  **Type**: Choose **OAuth 2.0 (3LO)**.
3.  **APIs & Scopes**:
    *   **Jira API**: Add scopes `read:jira-work`, `write:jira-work`, `manage:jira-project-config`.
    *   **User Identity API**: Add scopes `read:me`, `read:jira-user`, `offline_access`.
4.  **Authorization**:
    *   Set the **Callback URL** to match your environment (e.g., `http://localhost:3000/panel` or `http://localhost:3000/`).
    *   *Note: This must match exactly with `NEXT_PUBLIC_JIRA_REDIRECT_URI` in your `.env` file.*
5.  **Credentials**: Copy the `Client ID` and `Client Secret` to your `.env` file.

---

## 3. Supabase Setup (Optional for Serverless/Vercel)
If you want to deploy on Vercel for free, use Supabase Realtime instead of Socket.io.

1.  **Create Project**: Go to [Supabase Dashboard](https://supabase.com/dashboard) and create a new project.
2.  **Enable Realtime**:
    *   Go to **Project Settings** > **API** > **Realtime** (in the sidebar).
    *   Ensure **Broadcast** is toggled **ON**.
3.  **Get Keys**:
    *   Go to **Project Settings** > **API**.
    *   Copy the **Project URL** and **anon public key**.
4.  **Configure .env**:
    *   Set `NEXT_PUBLIC_REALTIME_PROVIDER="supabase"`
    *   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 4. Environment Variables (`.env`)
Create a `.env` file based on `.env.example` and configure these key variables:

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_JIRA_CLIENT_ID` | From Atlassian Console |
| `JIRA_CLIENT_SECRET` | From Atlassian Console (KEEP PRIVATE) |
| `NEXT_PUBLIC_JIRA_REDIRECT_URI` | Must match Atlassian Console exactly |
| `NEXT_PUBLIC_BASE_URL` | Application root URL |
| `NEXT_PUBLIC_DEFAULT_ESTIMATE_UNIT` | Initial unit (`pt` or `h`) |
| `NEXT_PUBLIC_REALTIME_PROVIDER` | `socketio` or `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |

---

## 🏗️ Build & Run
```bash
# Install dependencies
npm install

# Run in Development mode
npm run dev

# Build and Run in Production mode
npm run build
npm run start
```

---

> [!IMPORTANT]
> **Security Note:** Ensure `JIRA_CLIENT_SECRET` is only stored in your server-side `.env` and never committed to version control. The project is already configured with `.gitignore` to prevent this.
