# Posting the staffing roster to Google Drive

Staffing › **Google Sheet** posts the roster (one line per seat: site, position, tactical call, shift, status, call sign, name, phone) to the planner's own Google Drive as a Google Sheet, shared read-only with anyone who has the link, and puts that link on every operator's packet. Clicking the button again updates the same sheet, so the link never changes.

It works from the browser only. Google refuses its sign-in inside embedded webviews, so the desktop app shows a note pointing to emcommplanner.org for this one action. Nothing is stored server-side except the sheet's id and link on the deployment; the access token lives in the page for an hour and the scope is `drive.file` (the app can only see files it created).

## One-time setup (project owner)

1. In [Google Cloud Console](https://console.cloud.google.com/) create or pick a project and open **APIs & Services › Library**; enable the **Google Drive API**.
2. **APIs & Services › OAuth consent screen**: External, app name "EmComm Planner", your support email, scope `.../auth/drive.file`. Publish the app (or add your planners as test users while it is in Testing).
3. **APIs & Services › Credentials › Create credentials › OAuth client ID**, type **Web application**.
   - Authorised JavaScript origins: `https://emcommplanner.org` and `http://localhost:5173` (for development).
   - No redirect URIs are needed; the token client uses a popup.
4. Copy the **Client ID** (it ends in `.apps.googleusercontent.com`; it is public, not a secret).
5. Make it available at build time:
   - Locally: `VITE_GOOGLE_CLIENT_ID=...` in `.env.local`.
   - Releases: repository **Settings › Secrets and variables › Actions › Variables**, new variable `VITE_GOOGLE_CLIENT_ID`. The Release workflow passes it into the build; when it is absent the button explains that Drive is not configured.

## Current state (2026-09-12)

Done for emcommplanner.org: Google Cloud project **EmComm Planner** (id `emcomm-planner`, owner kk4oda@gmail.com), Drive API enabled, consent screen "EmComm Planner" (External), web client "EmComm Planner web" with origins `https://emcommplanner.org` and `http://localhost:5173`, repository variable `VITE_GOOGLE_CLIENT_ID` set. The consent screen is **published (In production)** with homepage https://emcommplanner.org and privacy policy https://emcommplanner.org/privacy (`docs/PRIVACY.md`), so any Google account can post the sheet; the scope is non-sensitive, so no Google review is involved.

## What operators see

- On the packet, a **Staffing roster** link opens the sheet in Google Sheets (works on phones, prints well, sortable).
- The packet also carries the roster inline, grouped by site, so it is available offline and on paper without Google.
