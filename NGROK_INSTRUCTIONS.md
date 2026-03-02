# Exposing WFMS with ngrok (recommended: app-level basic auth)

This document explains how to run the WFMS server locally with optional app-level Basic Auth and expose it via ngrok. Follow the steps that match your OS.

Important: ngrok requires an account and authtoken for stable tunnels. You can protect your server at the app level instead of relying on ngrok auth.

1) Install dependencies (if not already):

Windows (PowerShell / CMD):
```powershell
cd "C:\Users\Otto Wilson\Downloads\wfms test"
npm install
```

Linux / macOS:
```bash
cd ~/Downloads/wfms\ test
npm install
```

2) Option A — Protect the app with Basic Auth (recommended)

The server supports optional Basic Auth via environment variables. Example values:
- `ENABLE_BASIC_AUTH=true`
- `BASIC_AUTH_USER=wfms`
- `BASIC_AUTH_PASS=mysecretpassword`

Start the server with Basic Auth enabled.

Windows PowerShell:
```powershell
$env:PORT=8002; $env:ENABLE_BASIC_AUTH='true'; $env:BASIC_AUTH_USER='wfms'; $env:BASIC_AUTH_PASS='mysecretpassword'; node server.js
```

Windows CMD:
```cmd
set PORT=8002&& set ENABLE_BASIC_AUTH=true&& set BASIC_AUTH_USER=wfms&& set BASIC_AUTH_PASS=mysecretpassword&& node server.js
```

Linux / macOS:
```bash
PORT=8002 ENABLE_BASIC_AUTH=true BASIC_AUTH_USER=wfms BASIC_AUTH_PASS=mysecretpassword node server.js &
```

3) Option B — (ngrok-level auth) Install your authtoken

If you prefer to use ngrok-managed auth/policies, install your authtoken first (recommended):

```bash
npx ngrok authtoken YOUR_NGROK_AUTHTOKEN
```

4) Start ngrok (after server is running)

Basic usage (shows public forwarding URL):

```bash
npx ngrok http 8002
```

If you installed an authtoken the public URL will be returned by ngrok. Copy the https URL (for example `https://abcd-1234.ngrok.app`).

5) Test the tunneled endpoint (example using Basic Auth)

Use curl with Basic Auth when app-level auth is enabled:

```bash
curl -u wfms:mysecretpassword https://<your-ngrok-url>/api/users
```

If your tunnel requires ngrok-level auth/policy, follow ngrok docs to configure traffic policy JSON and use `--traffic-policy-file`.

6) Stop

- Stop the server with Ctrl+C in the server terminal
- Stop ngrok with Ctrl+C in the ngrok terminal

Notes
- Keep your ngrok authtoken private.
- App-level Basic Auth is a simple and effective way to protect the server while testing without exposing credentials in the tunnel provider.
- If ngrok returns authentication errors, run `npx ngrok authtoken <TOKEN>` to register your account locally.

Questions or want me to start ngrok here after you provide an authtoken? Reply and I will proceed.
