# Security Deployment Notes

This branch adds server-side UI auth, CORS allowlist, and per-agent secrets. Use these settings in production.

## Central (AWS) environment
Set these on the central server (or in an EnvironmentFile):
- `SESSION_SECRET=...` (required, random 32+ chars)
- `UI_USERS=admin:admin:<hash>` (format: `username:role:hash` or `username:hash`)
- Or single-user envs: `UI_USERNAME=admin`, `UI_PASSWORD_HASH=<hash>`, `UI_ROLE=admin`
- `REQUIRE_UI_AUTH=true`
- `SESSION_TTL_HOURS=12` (optional)
- `SESSION_COOKIE_SECURE=true` (keep true in prod)
- `SESSION_COOKIE_SAMESITE=lax` (optional, strict|lax|none)
- `CORS_ORIGINS=https://control.example.com,https://washcontrol.io`
- `REQUIRE_CORS_ORIGINS=true`
- `LEAD_FORM_ENABLED=true` (optional)
- `LEAD_RATE_LIMIT_MS=60000` (optional, per IP)
- `AGENT_SECRETS=Brandoa_1:secret1,Brandoa_2:secret2`
- `REQUIRE_KNOWN_AGENT=true`
- `ALLOW_DYNAMIC_AGENT_REGISTRATION=false`
- `ALLOW_LEGACY_AGENT_SECRET=false`
- `CENTRAL_PORT=4000`

Generate a password hash:
- `node scripts/hash-ui-password.js "your-password"`
- Then set `UI_USERS=admin:admin:<hash>`

Temporary migration flags (turn off after cutover):
- `ALLOW_LEGACY_AGENT_SECRET=true` (accepts old shared secret)
- `REQUIRE_KNOWN_AGENT=false` (allows unknown agents to connect once)

## Agent environment (per Raspberry Pi)
Each agent must have its own secret:
- `AGENT_ID=Brandoa_1`
- `AGENT_SECRET=secret1`
- `AGENT_WS_URL=wss://control.example.com/agent`
- `PIN_MAP=7:21` (if needed)

## TLS + reverse proxy
Terminate TLS in front of the central server and proxy both HTTP and WS.
Use the provided `deploy/caddy/Caddyfile` (or any reverse proxy):
- Expose only `:443` publicly.
- Bind central on localhost or block port 4000 in the firewall.
- Ensure `/api`, `/auth`, and `/agent` are proxied to central.
- If you host a landing page on `washcontrol.io`, proxy `/lead` to central.

## UI auth
Auth is handled by the central server via session cookies:
- Build UI without embedded credentials (no VITE_* secrets).
- If you run local dev over http, set `SESSION_COOKIE_SECURE=false`.

## Secrets and OS hardening
- Store secrets in `/etc/laundropi/*.env` with permissions `600`.
- Run services under a dedicated user (not root).
- Disable password SSH logins; use key auth only.
- Keep OS packages updated.

## AWS firewall
Security group should allow:
- Inbound: `443/tcp` (and `22/tcp` from your IP only)
- No public access to `4000`, `3000`, or database ports.
