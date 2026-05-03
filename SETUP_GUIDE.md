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

## 3. Environment Variables (`.env`)
Create a `.env` file based on `.env.example` and configure these key variables:

| Variable | Description |
| :--- | :--- |
| `NEXT_PUBLIC_JIRA_CLIENT_ID` | From Atlassian Console |
| `JIRA_CLIENT_SECRET` | From Atlassian Console (KEEP PRIVATE) |
| `NEXT_PUBLIC_JIRA_REDIRECT_URI` | Must match Atlassian Console exactly |
| `NEXT_PUBLIC_BASE_URL` | Application root URL |
| `NEXT_PUBLIC_DEFAULT_ESTIMATE_UNIT` | Initial unit (`pt` or `h`) |

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
