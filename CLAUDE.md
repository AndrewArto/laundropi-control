# Claude Context for WashControl / LaundroPi Control

## Development Rules

1. **Run full test suite before any commit:** Always run `npm test` and ensure all tests pass before committing changes.
2. **Fix all failing tests:** If tests fail, fix them before proceeding with the commit. Do not commit with failing tests.
3. **Version tagging:** After significant changes, create a new minor version tag (e.g., v1.11.0) with a descriptive annotation.

## SSH Access

### AWS Server (Central + UI + Landing Page)
- **Host:** 3.249.38.131
- **User:** ubuntu
- **Key:** ~/.ssh/laundropi_aws

### Agent: LdBrandoa1 (Laundromat 1)
- **Host:** LdBrandoa1
- **IP:** 100.107.170.119 (Tailscale)
- **User:** artamonov
- **Key:** ~/.ssh/id_ed25519

### Agent: LdBrandoa2 (Laundromat 2)
- **Host:** LdBrandoa2
- **IP:** 100.126.119.4 (Tailscale)
- **User:** artamonov
- **Key:** ~/.ssh/id_ed25519_ldbrandoa2

## Architecture

- **Central Server (AWS):** Runs API, WebSocket server, web UI, and landing page
- **Agents (Raspberry Pi 5):** One per laundromat, connects to central via WebSocket
- **Domains:**
  - `ui.washcontrol.io` - Control panel (React app)
  - `washcontrol.io` - Public landing page (lead capture)

## Landing Page (washcontrol.io)

The public marketing/landing page is served by Caddy on the AWS server.

**Location:** `/var/www/washcontrol/`
- `index.html` - Main landing page
- `assets/washcontrol-logo.svg` - Logo (should match `public/washcontrol-logo.svg` in this repo)
- `assets/washcontrol-logo.png` - PNG version of logo
- `assets/hero.jpg` - Background hero image

**Features:**
- "Coming Soon" / "Launching Soon" page
- Email lead capture form
- Leads are submitted to `/lead` endpoint (proxied to central server's `/api/leads`)
- Honeypot spam protection (hidden "company" field)

**To update the landing page:**
```bash
# Copy logo from local to server
scp public/washcontrol-logo.svg 3.249.38.131:/var/www/washcontrol/assets/

# Edit index.html directly on server
ssh 3.249.38.131 "nano /var/www/washcontrol/index.html"
```
