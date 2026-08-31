# Android TV — Kaisen X Anime TV (bundled UI)

The 10-foot UI lives entirely under `src/tv/`, is mounted additively at
`/tv/*`, and is **bundled inside the APK** via Capacitor (`webDir: dist`).
The APK does NOT load any website URL for its interface and needs no custom
domain to launch. The desktop/mobile site is untouched.

## How the API base works

The frontend calls the backend with root-relative paths (`/api/...`). Inside
the APK there is no same-origin backend, so every call site goes through a
single seam: `src/api/base.js`.

```js
export const API_BASE   // '' by default (website = same-origin, unchanged)
```

Resolution order:

1. `VITE_API_BASE_URL` build-time env var
2. `window.__KAISEN_API_BASE__` runtime global (optional)
3. `''` → relative paths (current website behavior)

**The Android TV app uses whatever `VITE_API_BASE_URL` was set to when its web
assets were built.** You supply your real backend origin at build time; nothing
is hardcoded in the repo. The current value is visible on the TV in
Settings → About → Backend.

### Building the APK

```bash
# 1. Build the web assets WITH your backend origin baked in:
VITE_API_BASE_URL="https://your-backend.example.com" npm run build

# Windows PowerShell:
$env:VITE_API_BASE_URL="https://your-backend.example.com"; npm run build

# 2. Copy dist/ + config into the native project:
npx cap sync android

# 3. Build:
cd android && .\gradlew assembleDebug
# output: android\app\build\outputs\apk\debug\app-debug.apk
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
```

Release: `.\gradlew assembleRelease` (configure signing as usual).

If you serve the website and the API from the same origin, set
`VITE_API_BASE_URL` to that origin (e.g. `https://site.example.com`). If you
run the API locally during development, use your machine's LAN IP
(e.g. `http://192.168.x.x:3001`) so the TV can reach it, and make sure the
server sends permissive CORS headers for the APK origin (`https://localhost`,
Capacitor's default).

### What still talks directly to the internet from the device

- AniList GraphQL (`https://graphql.anilist.co`) — anime/manga metadata
- Firebase Auth + Firestore — auth, watchlist, favorites, continue watching,
  notifications (email/password auth works from any origin; if you enforce
  Firebase App Check, keep it in monitor mode or register the app)
- Media segments/subtitles are proxied through YOUR backend
  (`${API_BASE}/api/media/proxy`) exactly like on the web

## Launch behavior

On startup, if running inside Capacitor and not already under `/tv`, the app
replaces history state with `/tv` before the router mounts
(`src/main.jsx`), so the APK always opens the TV UI directly. Browsers are
unaffected.

## Dev loop on a real TV / box

```bash
npm run dev                                  # vite on :5173
adb tcpip 5555 && adb connect <tv-ip>
adb reverse tcp:5173 tcp:5173                # device localhost -> your machine
```

Temporarily point the WebView at the dev server by adding `"url":
"http://localhost:5173/tv"` to `server` in `capacitor.config.json`
(`"cleartext": true` may be needed), then `npx cap sync android`. Remove it
before release builds.

## Remote control mapping

| Remote key        | Action                                                        |
| ----------------- | ------------------------------------------------------------- |
| D-pad arrows      | Spatial navigation between focusable elements                 |
| OK / Enter        | Activate focused element                                      |
| Back              | Close overlay (player controls, episode list, audio menu) → navigate back |
| Escape (desktop)  | Same as Back                                                  |

Focus visuals: `.tv-focused` in `src/tv/tv.css`. Engine:
`src/tv/TVFocusManager.jsx`.

## Files

```
capacitor.config.json           appId com.kaisenx.animetv, webDir dist, NO server.url
android/                        Native project
android/app/src/main/AndroidManifest.xml   LEANBACK_LAUNCHER, landscape, banner
android/app/src/main/res/drawable-xhdpi/banner.png  TV home banner (320x180)
src/api/base.js                 API_BASE seam used by every /api call site
src/tv/                         All TV UI code
src/utils/episodeProgression.js Shared autoplay engine (web + TV)
```

Replace `banner.png` and the mipmaps with branded art when ready.
