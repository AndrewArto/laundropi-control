# Security Deployment Notes

This branch adds API auth, CORS allowlist, and per-agent secrets. Use these settings in production.

## Central (AWS) environment
Set these on the central server (or in an EnvironmentFile):
- `UI_TOKEN=...` (required, used by UI for API calls)
- `REQUIRE_UI_TOKEN=true`
- `CORS_ORIGINS=https://control.example.com`
- `REQUIRE_CORS_ORIGINS=true`
- `AGENT_SECRETS=Brandoa_1:secret1,Brandoa_2:secret2`
- `REQUIRE_KNOWN_AGENT=true`
- `ALLOW_DYNAMIC_AGENT_REGISTRATION=false`
- `ALLOW_LEGACY_AGENT_SECRET=false`
- `CENTRAL_PORT=4000`

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

## UI token
The UI must send the token on every API request:
- Build the UI with `VITE_UI_TOKEN=...` in the frontend env.
- Restrict UI access with Basic Auth or private network, since the token is in the bundle.

## Secrets and OS hardening
- Store secrets in `/etc/laundropi/*.env` with permissions `600`.
- Run services under a dedicated user (not root).
- Disable password SSH logins; use key auth only.
- Keep OS packages updated.

## AWS firewall
Security group should allow:
- Inbound: `443/tcp` (and `22/tcp` from your IP only)
- No public access to `4000`, `3000`, or database ports.
