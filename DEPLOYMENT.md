# Production Deployment Guide

## Overview

**Branch:** `refactor/critical-improvements`
**Deployment Method:** Git pull on each host
**Production Setup:**
- AWS Server: Central + Caddy (UI)
- Laundromat 1: Raspberry Pi 5 (Agent)
- Laundromat 2: Raspberry Pi 5 (Agent)

## Pre-Deployment Checklist

- [ ] All changes committed to `refactor/critical-improvements` branch
- [ ] Branch pushed to remote repository
- [ ] Database backup created on AWS server
- [ ] Rollback plan reviewed

## What's Being Deployed

### Security Fixes (Critical)
1. XSS prevention in camera SVG rendering
2. UUID-based command IDs (prevents collision)
3. Rate limiting enforcement
4. Secure random admin passwords
5. RTSP credential URL encoding

### Architecture Improvements
1. Middleware layer (auth, CORS)
2. Service layer (relay, schedule management)
3. Route separation (auth endpoints)
4. Shared utilities

### Bug Fixes
1. Camera configuration fix (Insta360 Link 2 support)
2. 1-second camera refresh rate
3. FFmpeg protocol support

### Database Safety
✅ All changes are **backwards compatible**
✅ No data deletion or table drops
✅ `CREATE TABLE IF NOT EXISTS` pattern used
✅ Existing data fully preserved

---

## Step-by-Step Deployment

### Phase 1: Backup (AWS Server)

```bash
# SSH to AWS server
ssh user@your-aws-server

# Navigate to app directory
cd /path/to/laundropi-control  # Update with actual path

# Create backup directory
mkdir -p ~/backups

# Backup database
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
cp /var/lib/laundropi/central.db ~/backups/central.db.pre-refactor-$BACKUP_DATE

# Backup current code
tar -czf ~/backups/laundropi-control-pre-refactor-$BACKUP_DATE.tar.gz .

# Verify backup
ls -lh ~/backups/
```

### Phase 2: Update AWS Server (Central + UI)

```bash
# Still on AWS server

# Check current branch and status
git status
git branch

# Fetch latest changes
git fetch origin

# Checkout refactor branch
git checkout refactor/critical-improvements

# Pull latest changes
git pull origin refactor/critical-improvements

# Show what changed
git log --oneline -10

# Install any new dependencies
npm install

# Build the application
npm run build

# IMPORTANT: Check if you have production env file
ls -la .env* config/

# If using systemd, restart services
sudo systemctl restart laundropi-central
sudo systemctl restart laundropi-ui  # If separate service

# OR if using PM2
pm2 restart laundropi-central
pm2 restart laundropi-ui

# Check service status
sudo systemctl status laundropi-central
# OR
pm2 status

# Monitor logs for errors
sudo journalctl -u laundropi-central -f
# OR
pm2 logs laundropi-central
```

### Phase 3: Verify Central Server

```bash
# Check server is responding
curl -v http://localhost:4000/health  # Or your central port

# Check database connection
# The server logs should show: [central] DB path /var/lib/laundropi/central.db

# Verify no errors in logs
sudo journalctl -u laundropi-central --since "5 minutes ago" | grep -i error

# Check that UI is accessible
curl -v http://localhost:3000  # Or your UI port
```

### Phase 4: Update Laundromat 1 (Raspberry Pi)

```bash
# SSH to Laundromat 1
ssh pi@laundromat1  # Use your actual hostname/IP

# Navigate to app directory
cd /path/to/laundropi-control

# Check current state
git status
git branch

# Fetch and checkout refactor branch
git fetch origin
git checkout refactor/critical-improvements
git pull origin refactor/critical-improvements

# Install dependencies
npm install

# Restart agent service
sudo systemctl restart laundropi-agent
# OR
pm2 restart laundropi-agent

# Check status
sudo systemctl status laundropi-agent
# OR
pm2 status

# Monitor logs
sudo journalctl -u laundropi-agent -f --since "1 minute ago"
```

### Phase 5: Update Laundromat 2 (Raspberry Pi)

```bash
# SSH to Laundromat 2
ssh pi@laundromat2  # Use your actual hostname/IP

# Repeat same steps as Laundromat 1
cd /path/to/laundropi-control
git fetch origin
git checkout refactor/critical-improvements
git pull origin refactor/critical-improvements
npm install
sudo systemctl restart laundropi-agent
sudo systemctl status laundropi-agent
```

### Phase 6: Verification

```bash
# On AWS server, check agent connections
# Look in central logs for:
# [central] agent connected Laundromat1
# [central] agent connected Laundromat2

sudo journalctl -u laundropi-central --since "5 minutes ago" | grep "agent connected"

# Test from UI
# 1. Open browser to your production URL
# 2. Login
# 3. Check Dashboard - verify agents are online
# 4. Test relay toggle
# 5. Check camera preview (if configured)
# 6. Verify schedules are intact
# 7. Check revenue entries are present
```

---

## Rollback Procedure

If something goes wrong, rollback immediately:

### Rollback AWS Server

```bash
# SSH to AWS server
ssh user@your-aws-server
cd /path/to/laundropi-control

# Stop services
sudo systemctl stop laundropi-central laundropi-ui

# Restore database
cp ~/backups/central.db.pre-refactor-TIMESTAMP /var/lib/laundropi/central.db

# Restore code
git checkout main  # Or your previous stable branch

# Rebuild
npm install
npm run build

# Restart services
sudo systemctl start laundropi-central laundropi-ui
sudo systemctl status laundropi-central laundropi-ui
```

### Rollback Raspberry Pi Agents

```bash
# On each Pi
ssh pi@laundromat-X
cd /path/to/laundropi-control

sudo systemctl stop laundropi-agent
git checkout main  # Or previous stable branch
npm install
sudo systemctl start laundropi-agent
sudo systemctl status laundropi-agent
```

---

## Production Environment Variables

Make sure these are set in your production environment:

### AWS Server (.env or systemd environment)

```bash
# Central server
CENTRAL_PORT=4000  # Or your port
CENTRAL_DB_PATH=/var/lib/laundropi/central.db  # Persistent path!
SESSION_SECRET=<your-production-secret>
REQUIRE_UI_AUTH=true
SESSION_TTL_HOURS=12
CORS_ORIGINS=https://your-domain.com
REQUIRE_CORS_ORIGINS=true

# Agent secrets
AGENT_SECRETS=Laundromat1:prod-secret-1,Laundromat2:prod-secret-2

# Camera settings (adjust as needed)
CAMERA_FRAME_CACHE_MS=1000
CAMERA_FRAME_MIN_INTERVAL_MS=1000
CAMERA_FRAME_TIMEOUT_MS=4000

# Encryption
INTEGRATION_SECRETS_KEY=<your-production-key>

# Optional: Set initial admin password instead of random
# INITIAL_ADMIN_PASSWORD=<secure-password>
```

### Raspberry Pi (.env or systemd environment)

**Brandoa1** (fast refresh, stable power):
```bash
AGENT_ID=Brandoa1
AGENT_SECRET=prod-secret-1
AGENT_WS_URL=wss://ui.washcontrol.io/agent
MOCK_GPIO=false
CAMERA_FRAME_CACHE_MS=1000  # 1-second cache for fast refresh
CAMERA_FRAME_FETCH_TIMEOUT_MS=3000
```

**Brandoa2** (slower refresh, weak power supply):
```bash
AGENT_ID=Brandoa2
AGENT_SECRET=prod-secret-2
AGENT_WS_URL=wss://ui.washcontrol.io/agent
MOCK_GPIO=false
CAMERA_FRAME_CACHE_MS=5000  # 5-second cache to reduce power load
CAMERA_FRAME_FETCH_TIMEOUT_MS=3000
```

---

## Post-Deployment Monitoring

### First 24 Hours

Monitor these logs closely:

```bash
# Central server
sudo journalctl -u laundropi-central -f

# Watch for:
# - Agent connection/disconnection events
# - Relay command acknowledgments
# - Schedule pushes
# - Camera frame requests
# - Any ERROR or WARN messages
```

### Check Database Integrity

```bash
# On AWS server
sqlite3 /var/lib/laundropi/central.db

# Run these checks:
SELECT COUNT(*) FROM revenue_entries;  -- Should match pre-deployment count
SELECT COUNT(*) FROM ui_users;         -- Should have your users
SELECT COUNT(*) FROM schedules;        -- Should have your schedules
SELECT COUNT(*) FROM groups;           -- Should have your groups
.exit
```

---

## Common Issues & Solutions

### Issue: Agent won't connect

**Symptoms:** No "agent connected" logs
**Solution:**
1. Check agent logs: `sudo journalctl -u laundropi-agent -f`
2. Verify `AGENT_SECRET` matches central server
3. Check `AGENT_WS_URL` is correct
4. Verify network connectivity: `ping your-aws-server`

### Issue: Database file not found

**Symptoms:** `ENOENT: no such file or directory`
**Solution:**
1. Check `CENTRAL_DB_PATH` environment variable
2. Create directory: `sudo mkdir -p /var/lib/laundropi`
3. Set permissions: `sudo chown your-user:your-group /var/lib/laundropi`

### Issue: Camera not working

**Symptoms:** Camera shows pattern instead of video
**Solution:**
1. Check camera is enabled in UI
2. Verify go2rtc is running on agent
3. Check camera URL format includes `#video=mjpeg`
4. Review agent logs for FFmpeg errors

### Issue: Relays not responding

**Symptoms:** Toggle doesn't work
**Solution:**
1. Check agent is connected (central logs)
2. Verify relay state sync in logs
3. Check GPIO permissions on Pi: `groups` should include `gpio`

---

## Success Criteria

✅ All agents connected and showing online
✅ Relay toggles work from UI
✅ Schedules are intact and active
✅ Revenue entries are present
✅ User accounts work (login/logout)
✅ No errors in logs for 1 hour
✅ Camera previews working (if configured)

---

## Support

If issues persist after deployment:

1. Check logs on all hosts
2. Review git diff to see what changed
3. Test rollback procedure
4. Review REFACTORING_SUMMARY.md for architecture changes

---

**Date Created:** 2026-01-20
**Branch:** refactor/critical-improvements
**Commits:** a49b354 → 1edf373 (6 commits)
