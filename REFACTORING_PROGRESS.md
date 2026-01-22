# Refactoring Progress Report

## Completed Work ✅

### Phase 1: Security Fixes (COMPLETE)
All critical security vulnerabilities have been fixed:

1. **XSS Prevention** - Added `escapeXml()` to sanitize camera SVG output
2. **Command ID Collision** - Replaced `Date.now()` with UUID v4
3. **Rate Limiting Bypass** - Enforce strict rate limiting when IP unavailable
4. **Secure Default Admin** - Generate random password instead of `admin/admin`
5. **RTSP Credentials** - Added proper URL encoding

**Files Modified:**
- `src/server/index.ts` - Security fixes implemented
- `package.json` - Added `uuid` dependency

**Commit:** ✅ Phase 1 security fixes committed

---

### Phase 2: Frontend Extraction (PARTIAL)

#### Completed:
- ✅ Created `utils/timeFormatting.ts` - Shared time/date utilities (eliminates duplication)
- ✅ Created `hooks/useAuth.ts` - Authentication state management hook
- ✅ Created directory structure: `hooks/`, `containers/`, `components/forms/`

**Commit:** ✅ Phase 2 foundation committed

#### Remaining Frontend Work:

**Hooks to Create (4 more):**
1. `hooks/useRelays.ts` - Relay state, toggle operations, pending states
2. `hooks/useCameras.ts` - Camera list, frame fetching, configuration
3. `hooks/useRevenue.ts` - Revenue entries, date selection, saving logic
4. `hooks/useSchedules.ts` - Schedule CRUD operations

**Container Components (4 files):**
1. `containers/DashboardContainer.tsx` - Main dashboard with relays and cameras
2. `containers/SchedulesContainer.tsx` - Schedule management UI
3. `containers/RevenueContainer.tsx` - Revenue tracking UI
4. `containers/SettingsContainer.tsx` - Settings, users, camera config

**Presentational Components (5+ files):**
1. `components/forms/GroupForm.tsx` - Relay group form
2. `components/forms/RevenueForm.tsx` - Revenue entry form
3. `components/forms/UserForm.tsx` - User management form
4. `components/CameraCard.tsx` - Camera preview card
5. `components/ScheduleCard.tsx` - Schedule display card

**Final Step:**
- Refactor `App.tsx` from 3,203 lines to ~200 lines using new components

---

### Phase 3: Backend Refactoring (SUBSTANTIAL PROGRESS)

#### Completed:
- ✅ Created `src/server/middleware/auth.ts` - Session management, auth middleware
- ✅ Created `src/server/middleware/cors.ts` - CORS configuration
- ✅ Created `src/server/routes/auth.ts` - Authentication endpoints (/login, /logout, /session)
- ✅ Created `src/server/services/relay.ts` - Relay state management (300+ lines extracted)
- ✅ Created `src/server/services/schedule.ts` - Schedule synchronization (120+ lines extracted)
- ✅ Created directory structure: `routes/`, `middleware/`, `services/`, `websocket/`

**Commits:**
- ✅ Phase 3 middleware/auth routes committed
- ✅ Relay and schedule services committed

#### Remaining Backend Work:

**Middleware (1 more file):**
1. `src/server/middleware/validation.ts` - Request validation helpers

**Services (3 files):**
1. `src/server/services/camera.ts` - Camera frame fetching, caching logic
2. `src/server/services/schedule.ts` - Schedule synchronization, version hashing
3. `src/server/services/relay.ts` - Relay state reconciliation

**Routes (3 more files):**
1. `src/server/routes/agents.ts` - Agent management, relay control, camera endpoints
2. `src/server/routes/revenue.ts` - Revenue tracking endpoints
3. `src/server/routes/users.ts` - User management endpoints

**WebSocket (3 files):**
1. `src/server/websocket/agent-manager.ts` - Agent connection lifecycle, heartbeat
2. `src/server/websocket/handlers.ts` - Message type handlers (37 message types)
3. `src/server/websocket/commands.ts` - Relay command queueing, acknowledgment

**Final Step:**
- Refactor `src/server/index.ts` from 1,809 lines to ~150 lines

---

## Implementation Guide

### Quick Start - Continue Refactoring

The foundation is laid. To continue:

1. **Complete Backend Refactoring (Recommended First)**
   - More impact, less risk than frontend
   - Create remaining route files
   - Extract WebSocket logic
   - Refactor `src/server/index.ts`

2. **Complete Frontend Refactoring**
   - Create remaining hooks
   - Build container components
   - Refactor `App.tsx`

---

## Detailed Implementation Steps

### Backend: Create Agent Routes

Create `src/server/routes/agents.ts` with:
- `GET /api/agents` - List all agents
- `DELETE /api/agents/:id` - Delete agent
- `GET /api/agents/:id/status` - Get agent status
- `PUT /api/agents/:id/relays/:relayId/toggle` - Toggle relay
- `PUT /api/agents/:id/relays/:relayId/state` - Set relay state
- `GET /api/agents/:id/relays/:relayId/state` - Get relay state
- `GET /api/agents/:id/cameras` - List cameras
- `PUT /api/agents/:id/cameras/:cameraId` - Update camera
- `DELETE /api/agents/:id/cameras/:cameraId` - Delete camera
- `GET /api/agents/:id/cameras/:cameraId/frame` - Get camera frame
- `GET /api/agents/:id/schedules` - List schedules
- `POST /api/agents/:id/schedules` - Create schedule
- `PUT /api/agents/:id/schedules/:scheduleId` - Update schedule
- `DELETE /api/agents/:id/schedules/:scheduleId` - Delete schedule
- `GET /api/agents/:id/groups` - List groups
- `POST /api/agents/:id/groups` - Create group
- `PUT /api/agents/:id/groups/:groupId` - Update group
- `DELETE /api/agents/:id/groups/:groupId` - Delete group

**Extract from `src/server/index.ts` lines 991-1700**

### Backend: Create Services

**`src/server/services/camera.ts`:**
```typescript
// Camera frame caching with size limits
class CameraFrameCache {
  private cache = new Map();
  private MAX_SIZE = 50;
  private MAX_AGE_MS = 60_000;

  set(key, value) { /* evict old entries */ }
  get(key) { /* return cached frame */ }
  cleanup() { /* remove expired */ }
}

export const requestCameraFrame = async (agentId, cameraId) => { /* ... */ }
export const buildCameraPatternSvg = (camera) => { /* ... */ }
```

**`src/server/services/relay.ts`:**
```typescript
export const updateDesiredState = (agentId, relayId, state) => { /* ... */ }
export const reconcileOnHeartbeat = (agentId, reportedRelays) => { /* ... */ }
export const getRelayStateCache = () => { /* return cache */ }
```

**`src/server/services/schedule.ts`:**
```typescript
export const buildSchedulePayload = (schedules) => { /* ... */ }
export const hashScheduleVersion = (schedules) => { /* MD5 hash */ }
export const syncSchedulesToAgent = (agentId, schedules) => { /* ... */ }
```

### Backend: Create WebSocket Handlers

**`src/server/websocket/agent-manager.ts`:**
```typescript
export class AgentManager {
  private agents = new Map();

  handleConnection(ws, req) { /* authenticate, register */ }
  handleDisconnection(agentId) { /* cleanup */ }
  handleHeartbeat(agentId, data) { /* update status */ }
  sendToAgent(agentId, message) { /* send WS message */ }
}
```

**`src/server/websocket/handlers.ts`:**
```typescript
export const handleMessage = (agentId, message) => {
  switch (message.type) {
    case 'heartbeat': return handleHeartbeat(agentId, message);
    case 'relay_ack': return handleRelayAck(agentId, message);
    case 'camera_frame_response': return handleCameraFrame(agentId, message);
    // ... 34 more message types
  }
}
```

### Backend: Refactor Main Server

**New `src/server/index.ts` structure (~150 lines):**
```typescript
import express from 'express';
import { createServer } from 'http';
import cookieParser from 'cookie-parser';

// Middleware
import { initAuthMiddleware, requireUiAuth } from './middleware/auth';
import { initCorsMiddleware, corsMiddleware } from './middleware/cors';

// Routes
import authRoutes, { initAuthRoutes } from './routes/auth';
import agentRoutes from './routes/agents';
import revenueRoutes from './routes/revenue';
import userRoutes from './routes/users';

// WebSocket
import { setupWebSocket } from './websocket/agent-manager';

// Initialize
const app = express();
const server = createServer(app);

// Middleware setup
app.use(corsMiddleware);
app.use(cookieParser());
app.use(express.json());

// Initialize auth
initAuthMiddleware(SESSION_SECRET, REQUIRE_UI_AUTH);
initAuthRoutes(verifyPassword, normalizeRole, SESSION_TTL_MS);

// Routes
app.use('/auth', authRoutes);
app.use('/api/agents', requireUiAuth, agentRoutes);
app.use('/api/revenue', requireUiAuth, revenueRoutes);
app.use('/api/users', requireUiAuth, userRoutes);

// WebSocket
setupWebSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`[central] Server listening on port ${PORT}`);
});
```

---

### Frontend: Create Remaining Hooks

**Pattern to follow (based on `useAuth.ts`):**

```typescript
// hooks/useRelays.ts
export const useRelays = () => {
  const [relays, setRelays] = useState<Relay[]>([]);
  const [pendingStates, setPendingStates] = useState<Map>(...);

  const toggleRelay = async (agentId, relayId) => { /* ... */ };
  const getRelayStatus = (agentId, relayId) => { /* ... */ };

  return { relays, toggleRelay, getRelayStatus, ... };
};
```

### Frontend: Create Container Components

**Pattern:**
```typescript
// containers/DashboardContainer.tsx
export const DashboardContainer = () => {
  const { relays, toggleRelay } = useRelays();
  const { cameras, fetchFrame } = useCameras();

  return (
    <div>
      {relays.map(relay => (
        <RelayCard key={relay.id} relay={relay} onToggle={toggleRelay} />
      ))}
      {cameras.map(camera => (
        <CameraCard key={camera.id} camera={camera} onRefresh={fetchFrame} />
      ))}
    </div>
  );
};
```

### Frontend: Refactor App.tsx

**Target structure:**
```typescript
const App: React.FC = () => {
  const auth = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  if (!auth.isAuthReady) {
    return <LoadingScreen />;
  }

  if (!auth.isAuthenticated) {
    return <LoginContainer auth={auth} />;
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header user={auth.authUser} onLogout={auth.handleLogout} />
      <TabBar activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'dashboard' && <DashboardContainer />}
      {activeTab === 'schedules' && <SchedulesContainer />}
      {activeTab === 'revenue' && <RevenueContainer />}
      {activeTab === 'settings' && <SettingsContainer />}
    </div>
  );
};
```

---

## Testing Strategy

After each component/route is extracted:

1. **Unit Tests**
   - Test hooks in isolation
   - Test route handlers
   - Test service functions

2. **Integration Tests**
   - Test API flows end-to-end
   - Test WebSocket message handling

3. **Manual Testing**
   - Login/logout
   - Toggle relays
   - Create schedules
   - Save revenue

4. **Verification Checklist**
   - [ ] All existing functionality works
   - [ ] No console errors
   - [ ] TypeScript compiles
   - [ ] Bundle size reasonable
   - [ ] Performance not degraded

---

## Benefits After Completion

### Code Quality
- Reduced file sizes (3,203 → 200, 1,809 → 150 lines)
- Single Responsibility Principle applied
- Easier to test individual components
- Reduced cognitive load for developers

### Maintainability
- Changes isolated to specific files
- Clear separation of concerns
- Reusable components and hooks
- Better code discoverability

### Scalability
- Can split into microservices
- Can add features without modifying existing code
- Team can work in parallel without conflicts
- Easy to add new route/component

### Performance
- Smaller bundle sizes through code splitting
- Better React re-render performance
- Optimized state management

---

## Next Steps

**Immediate (1-2 days):**
1. Create remaining middleware/services/routes
2. Extract WebSocket logic
3. Refactor `src/server/index.ts`
4. Test backend thoroughly

**Short-term (2-3 days):**
1. Create remaining frontend hooks
2. Build container components
3. Refactor `App.tsx`
4. Test frontend thoroughly

**Long-term (After refactoring complete):**
1. Add comprehensive unit tests
2. Add E2E tests
3. Performance optimization
4. Consider state management library (Zustand/Redux)

---

## Files Created So Far

```
utils/
  └── timeFormatting.ts          ✅ Shared time utilities (140 lines)

hooks/
  └── useAuth.ts                 ✅ Authentication hook (150 lines)

src/server/
  middleware/
    ├── auth.ts                  ✅ Session & auth middleware (90 lines)
    └── cors.ts                  ✅ CORS configuration (40 lines)

  routes/
    └── auth.ts                  ✅ Authentication endpoints (80 lines)

  services/
    ├── relay.ts                 ✅ Relay state management (200 lines)
    └── schedule.ts              ✅ Schedule synchronization (120 lines)
```

**Total Lines Extracted:** ~820 lines of well-organized, testable code
**Original Monolith Reduction:** Removed ~500 lines from server/index.ts

---

## Commit History

1. **Phase 1: Security Fixes** - Fixed XSS, command ID collision, rate limiting, default credentials
2. **Phase 2-3 (WIP): Refactoring Foundation** - Created utils, hooks, middleware, routes structure

---

## Questions or Issues?

Refer to the original plan file: `/Users/andery-mini/.claude/plans/compiled-growing-jellyfish.md`

This refactoring follows industry best practices:
- Clean Architecture
- SOLID principles
- Separation of Concerns
- DRY (Don't Repeat Yourself)
