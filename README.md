<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy LaundroPi Control

This contains everything you need to run the control app locally.

## Run Locally

**Prerequisites:** Node.js 18+

1. Install dependencies: `npm install`
2. Start both client and API in dev: `npm run dev:all`  
   - Only client: `npm run dev` (Vite on :3000 with `/api` proxy to :3001)  
   - Only API: `npm run dev:server`

## Production security
See `deploy/security/README.md` for recommended TLS, auth, and agent secret setup.
