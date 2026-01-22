import React, { useEffect, useState } from 'react';
import { Relay, Schedule, RelayType, RelayGroup, RevenueEntry, RevenueAuditEntry, RevenueSummary, UiUser, CameraConfig, Laundry, RelaySelection } from './types';
import { ApiService, resolveBaseUrl } from './services/api';
import { DAYS_OF_WEEK } from './constants';
import { useAuth } from './hooks/useAuth';
import { useRelays } from './hooks/useRelays';
import { useCameras } from './hooks/useCameras';
import { useRevenue } from './hooks/useRevenue';
import { useSchedules } from './hooks/useSchedules';
import { useUsers } from './hooks/useUsers';
import { useGroups } from './hooks/useGroups';
import { useInventory } from './hooks/useInventory';
import { DashboardView } from './components/views/DashboardView';
import { SchedulesView } from './components/views/SchedulesView';
import { RevenueView } from './components/views/RevenueView';
import { SettingsView } from './components/views/SettingsView';
import { InventoryView } from './components/views/InventoryView';
import { LoginForm } from './components/LoginForm';
import { LoadingScreen } from './components/LoadingScreen';
import { Header } from './components/Header';
import { OfflineMessages } from './components/OfflineMessages';
import { BottomNavigation, Tab } from './components/BottomNavigation';
import { to24h, normalizeTimeInput, toDateInput, shiftDateByDays, shiftDateByMonths, getMonthRange } from './utils/dateTime';
import { formatMoney, formatTimestamp, formatLastLogin, isRevenueNumericInput } from './utils/formatting';
import { buildRevenueDraft, getLatestAudit, getDeductionSummary, RevenueDraft } from './utils/revenue';
import { exportRevenueToCsv } from './utils/csvExport';
import { AGENT_STALE_MS, PENDING_RELAY_TTL_MS, CAMERA_FRAME_REFRESH_MS, CAMERA_WARMUP_MS, DEFAULT_AGENT_ID, DEFAULT_AGENT_SECRET, IS_TEST_ENV, BRAND_LOGO_URL } from './constants/app';
import { selectionKey, relayDraftKey, relayPendingKey, markPendingRelayState as markPendingRelayStateUtil, applyPendingRelayStates as applyPendingRelayStatesUtil } from './utils/relay';
import { isLaundryOnline as isLaundryOnlineUtil, getOfflineAgents, getOfflineMessages as getOfflineMessagesUtil, normalizeGroupPayload, applyVisibility as applyVisibilityUtil, updateLaundryRelays } from './utils/laundry';
import { cameraDraftKey, cameraPositionOrder, buildCameraPreviewUrl as buildCameraPreviewUrlUtil, getCameraSlots as getCameraSlotsUtil } from './utils/camera';

const App: React.FC = () => {
  const renderCount = React.useRef(0);
  renderCount.current += 1;
  if (renderCount.current % 10 === 0) {
    console.log(`[LaundroPi] Render #${renderCount.current}`, new Date().toISOString());
  }

  // Custom hooks for state management
  const {
    relays,
    relayNameDrafts,
    relayVisibility,
    toggleRelay,
    saveRelayName,
    updateRelayNameDraft,
    toggleRelayVisibility,
    updateRelayIcon,
    setRelays,
    setRelayNameDrafts,
    setRelayVisibility,
    getPendingRelayState,
    setPendingRelayState,
    applyPendingRelayStates: applyPendingRelayStatesFromHook,
    resetRelayState,
  } = useRelays();

  const {
    cameraConfigs,
    cameraFrameSources,
    cameraPreviewErrors,
    cameraWarmup,
    cameraVisibility,
    cameraSaving,
    cameraToggleLoading,
    cameraSaveErrors,
    cameraRefreshTick,
    setCameraConfigs,
    setCameraFrameSources,
    setCameraPreviewErrors,
    setCameraWarmup,
    setCameraVisibility,
    setCameraSaving,
    setCameraToggleLoading,
    setCameraSaveErrors,
    setCameraRefreshTick,
    handleCameraEnabledToggle: handleCameraEnabledToggleFromHook,
    handleCameraSave: handleCameraSaveFromHook,
    resetCameraState,
  } = useCameras();

  const {
    schedules,
    setSchedules,
    addSchedule,
    updateSchedule,
    deleteSchedule,
    removeRelayFromSchedules,
    resetSchedulesState,
  } = useSchedules();

  const {
    revenueDate,
    revenueEntries,
    revenueDrafts,
    revenueAudit,
    revenueSummary,
    revenueLoading,
    revenueError,
    revenueSaving,
    revenueSaveErrors,
    revenueView,
    revenueEntryDates,
    revenueAllEntries,
    revenueAllLoading,
    revenueAllError,
    isRevenueCalendarOpen,
    setRevenueDate,
    setRevenueEntries,
    setRevenueDrafts,
    setRevenueAudit,
    setRevenueSummary,
    setRevenueLoading,
    setRevenueError,
    setRevenueSaving,
    setRevenueSaveErrors,
    setRevenueView,
    setRevenueEntryDates,
    setRevenueAllEntries,
    setRevenueAllLoading,
    setRevenueAllError,
    setIsRevenueCalendarOpen,
    updateRevenueDraft: updateRevenueDraftFromHook,
    addRevenueDeduction: addRevenueDeductionFromHook,
    removeRevenueDeduction: removeRevenueDeductionFromHook,
    handleRevenueSave: handleRevenueSaveFromHook,
    getLatestAudit: getLatestAuditFromHook,
    getDeductionSummary: getDeductionSummaryFromHook,
    resetRevenueState,
  } = useRevenue();

  const {
    users,
    usersLoading,
    usersError,
    userCreateError,
    userCreateLoading,
    newUserName,
    newUserPassword,
    newUserRole,
    userRoleDrafts,
    userPasswordDrafts,
    userSaving,
    userSaveErrors,
    setUsers,
    setUsersLoading,
    setUsersError,
    setUserCreateError,
    setUserCreateLoading,
    setNewUserName,
    setNewUserPassword,
    setNewUserRole,
    setUserRoleDrafts,
    setUserPasswordDrafts,
    setUserSaving,
    setUserSaveErrors,
    fetchUsers: fetchUsersFromHook,
    handleCreateUser: handleCreateUserFromHook,
    handleRoleSave: handleRoleSaveFromHook,
    handlePasswordSave: handlePasswordSaveFromHook,
    resetUsersState,
  } = useUsers();

  const {
    groups,
    newGroupName,
    newGroupSelections,
    newGroupOnTime,
    newGroupOffTime,
    newGroupDays,
    editingGroupId,
    groupSelectionTouched,
    isNewGroupVisible,
    setGroups,
    setNewGroupName,
    setNewGroupSelections,
    setNewGroupOnTime,
    setNewGroupOffTime,
    setNewGroupDays,
    setEditingGroupId,
    setGroupSelectionTouched,
    setIsNewGroupVisible,
    handleAddGroup: handleAddGroupFromHook,
    handleUpdateGroup: handleUpdateGroupFromHook,
    handleDeleteGroup: handleDeleteGroupFromHook,
    handleToggleGroupPower: handleToggleGroupPowerFromHook,
    dedupeSelections,
    resetGroupsState,
  } = useGroups();

  const {
    inventory,
    lastChanges,
    auditLog,
    showingAuditFor,
    inventoryError,
    fetchInventory,
    updateQuantity,
    viewAudit,
    closeAudit,
  } = useInventory();

  // State reset callback for useAuth
  const resetUiStateCallback = React.useCallback(() => {
    resetRelayState();
    resetCameraState();
    resetSchedulesState();
    resetRevenueState();
    resetUsersState();
    resetGroupsState();
    setLaundries([]);
    setAgentId(null);
    setAgentHeartbeat(null);
    setIsMockMode(true);
    setIsRelayEditMode(false);
    setServerOnline(true);
    setActiveTab(Tab.DASHBOARD);
  }, [resetRelayState, resetCameraState, resetSchedulesState, resetRevenueState, resetUsersState, resetGroupsState]);

  const {
    isAuthenticated,
    isAuthReady,
    authUser,
    authLogin,
    authPassword,
    authError,
    setAuthLogin,
    setAuthPassword,
    setAuthError,
    handleLoginSubmit,
    handleLogout,
    handleAuthFailure,
    isAuthenticatedRef,
  } = useAuth(resetUiStateCallback);

  const [activeTab, setActiveTab] = useState<Tab>(Tab.DASHBOARD);
  const [currentTime, setCurrentTime] = useState(new Date());
  const latestRelaysRef = React.useRef<Relay[]>([]);
  const [isRelayEditMode, setIsRelayEditMode] = useState(false);
  const isRelayEditModeRef = React.useRef(false);
  const editingGroupIdRef = React.useRef<string | null>(null);
  const relayEditAreaRef = React.useRef<HTMLDivElement | null>(null);
  const groupEditAreaRef = React.useRef<HTMLDivElement | null>(null);
  const relayVisibilityRef = React.useRef<Record<string, boolean>>({});
  const [serverOnline, setServerOnline] = useState(true);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agentHeartbeat, setAgentHeartbeat] = useState<number | null>(null);
  const agentOnline = agentHeartbeat !== null && (Date.now() - agentHeartbeat) < AGENT_STALE_MS;
  const controlsDisabled = IS_TEST_ENV ? false : (!serverOnline || !agentOnline);
  const [laundries, setLaundries] = useState<Laundry[]>([]);
  const laundriesRef = React.useRef<Laundry[]>([]);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraNameDrafts, setCameraNameDrafts] = useState<Record<string, string>>({});
  const [isPageVisible, setIsPageVisible] = useState(() => {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  });
  const cameraObserverRef = React.useRef<IntersectionObserver | null>(null);
  const cameraCardRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const cameraRefCallbacks = React.useRef<Map<string, (node: HTMLDivElement | null) => void>>(new Map());
  const isLaundryOnline = React.useCallback(
    (laundry: Laundry) => isLaundryOnlineUtil(laundry, serverOnline, AGENT_STALE_MS),
    [serverOnline]
  );
  const offlineAgents = React.useMemo(
    () => getOfflineAgents(laundries, isLaundryOnline),
    [laundries, isLaundryOnline]
  );
  const offlineMessages = React.useMemo(
    () => getOfflineMessagesUtil(serverOnline, offlineAgents),
    [serverOnline, offlineAgents]
  );
  const primaryAgentId = agentId || laundries[0]?.id || DEFAULT_AGENT_ID;
  const [isAddingLaundry, setIsAddingLaundry] = useState(false);
  const [newLaundryInput, setNewLaundryInput] = useState('');
  const [newLaundrySecret, setNewLaundrySecret] = useState(DEFAULT_AGENT_SECRET);
  const pendingRelayStatesRef = React.useRef<Map<string, { state: boolean; updatedAt: number }>>(new Map());
  const laundryIdKey = React.useMemo(() => laundries.map(l => l.id).sort().join('|'), [laundries]);

  const applyVisibility = (agentId: string, list: Relay[]) =>
    applyVisibilityUtil(agentId, list, relayVisibilityRef.current, relayDraftKey);

  const markPendingRelayState = (agentId: string, relayId: number, isOn: boolean) =>
    markPendingRelayStateUtil(pendingRelayStatesRef, agentId, relayId, isOn);

  const applyPendingRelayStates = (items: Laundry[]) =>
    applyPendingRelayStatesUtil(items, pendingRelayStatesRef, PENDING_RELAY_TTL_MS);

  const cameraPreviewBase = resolveBaseUrl();

  const buildCameraPreviewUrl = (camera: CameraConfig, agentId: string, options?: { cacheBust?: boolean }) =>
    buildCameraPreviewUrlUtil(camera, agentId, cameraPreviewBase, cameraRefreshTick, options);

  const getCameraSlots = (agentId: string) =>
    getCameraSlotsUtil(agentId, cameraConfigs);
  const registerCameraCard = React.useCallback((key: string, node: HTMLDivElement | null) => {
    const observer = cameraObserverRef.current;
    const existing = cameraCardRefs.current.get(key);
    if (existing && observer) observer.unobserve(existing);
    if (!node) {
      cameraCardRefs.current.delete(key);
      setCameraVisibility((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    node.dataset.cameraKey = key;
    cameraCardRefs.current.set(key, node);
    if (observer) observer.observe(node);
  }, []);
  const getCameraCardRef = React.useCallback((key: string) => {
    const cached = cameraRefCallbacks.current.get(key);
    if (cached) return cached;
    const cb = (node: HTMLDivElement | null) => registerCameraCard(key, node);
    cameraRefCallbacks.current.set(key, cb);
    return cb;
  }, [registerCameraCard]);



  const [isMockMode, setIsMockMode] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // DOM snapshot debug
  useEffect(() => {
    const root = document.getElementById('root');
    console.log('[LaundroPi] DOM snapshot childCount:', root?.childElementCount, 'innerHTML len:', root?.innerHTML.length);
  });

  // Set initial tab based on user role after auth
  useEffect(() => {
    if (isAuthenticated && authUser) {
      setActiveTab(authUser.role === 'admin' ? Tab.REVENUE : Tab.DASHBOARD);
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [isAuthenticated, authUser]);

  // Fetch data
  const fetchLaundries = async (force = false) => {
    try {
      if (isRelayEditModeRef.current && !force) {
        setIsLoading(false);
        return;
      }
      const agentIndex = await ApiService.listAgents();
      let primaryData: { schedules: Schedule[]; groups: RelayGroup[] } | null = null;
      const items: Laundry[] = await Promise.all(agentIndex.map(async (agent) => {
        try {
          const data = await ApiService.getStatus(agent.agentId);
          const lastHb = agent.lastHeartbeat ?? data.lastHeartbeat ?? null;
          const online = Boolean(agent.online) && (lastHb ? (Date.now() - lastHb) < AGENT_STALE_MS : true);
          if (!primaryData) {
            primaryData = { schedules: data.schedules, groups: data.groups };
          }
          return {
            id: agent.agentId,
            name: agent.agentId,
            relays: data.relays,
            isOnline: online,
            isMock: data.isMock,
            lastHeartbeat: lastHb,
          };
        } catch (e) {
          return {
            id: agent.agentId,
            name: agent.agentId,
            relays: [],
            isOnline: false,
            isMock: true,
            lastHeartbeat: agent.lastHeartbeat ?? null,
          };
        }
      }));

      setServerOnline(true);
      if (!isAuthenticatedRef.current) {
        setIsLoading(false);
        return;
      }

      // Only update laundries if data actually changed
      setLaundries(prev => {
        const next = applyPendingRelayStates(items);
        const hasChanges = JSON.stringify(prev) !== JSON.stringify(next);
        return hasChanges ? next : prev;
      });

      if (primaryData) {
        // Only update schedules if data actually changed
        setSchedules(prev => {
          const hasChanges = JSON.stringify(prev) !== JSON.stringify(primaryData.schedules);
          return hasChanges ? primaryData.schedules : prev;
        });
        setGroups(prev => {
          if (primaryData?.groups && primaryData.groups.length > 0) {
            const next = primaryData.groups.map(g => normalizeGroupPayload(g, items[0]?.id || primaryAgentId || DEFAULT_AGENT_ID));
            const hasChanges = JSON.stringify(prev) !== JSON.stringify(next);
            return hasChanges ? next : prev;
          }
          return prev;
        });
      } else {
        setSchedules(prev => prev.length > 0 ? [] : prev);
        setGroups(prev => prev.length > 0 ? [] : prev);
      }
      setIsLoading(false);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Critical Failure:', err);
      setServerOnline(false);
      setIsLoading(false);
      setAgentHeartbeat(null);
    }
  };

  const fetchCameras = async () => {
    const items = laundriesRef.current;
    if (!items.length) {
      setCameraConfigs({});
      setCameraLoading(false);
      setCameraError(null);
      return;
    }
    setCameraLoading(true);
    setCameraError(null);
    try {
      const results = await Promise.all(items.map(async (laundry) => {
        try {
          const res = await ApiService.listCameras(laundry.id);
          return { agentId: laundry.id, cameras: res.cameras || [] };
        } catch (err) {
          if (handleAuthFailure(err)) return { agentId: laundry.id, cameras: [] };
          console.error('Camera list fetch failed', err);
          return { agentId: laundry.id, cameras: [] };
        }
      }));
      const nextConfigs: Record<string, CameraConfig[]> = {};
      const nextDrafts: Record<string, string> = {};
      results.forEach(({ agentId, cameras }) => {
        const sorted = [...(cameras || [])].sort((a, b) => cameraPositionOrder(a.position) - cameraPositionOrder(b.position));
        nextConfigs[agentId] = sorted;
        sorted.forEach(camera => {
          nextDrafts[cameraDraftKey(agentId, camera.id)] = camera.name;
        });
      });
      // Only update state if camera config actually changed
      setCameraConfigs(prev => {
        const hasChanges = JSON.stringify(prev) !== JSON.stringify(nextConfigs);
        return hasChanges ? nextConfigs : prev;
      });
      setCameraNameDrafts(prev => {
        const hasChanges = Object.keys(nextDrafts).some(key => prev[key] !== nextDrafts[key]);
        return hasChanges ? { ...prev, ...nextDrafts } : prev;
      });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Camera list fetch failed', err);
      setCameraError('Unable to load cameras.');
    } finally {
      setCameraLoading(false);
    }
  };

  const refreshConnectivityOnly = async () => {
    try {
      const agentIndex = await ApiService.listAgents();
      setServerOnline(true);
      if (agentIndex.length === 0) {
        setLaundries([]);
        return;
      }
      setLaundries(prev => {
        const prevMap = new Map(prev.map(l => [l.id, l]));
        return agentIndex.map(agent => {
          const existing = prevMap.get(agent.agentId);
          const lastHb = agent.lastHeartbeat ?? existing?.lastHeartbeat ?? null;
          const online = Boolean(agent.online) && (lastHb ? (Date.now() - lastHb) < AGENT_STALE_MS : true);
          return {
            id: agent.agentId,
            name: existing?.name || agent.agentId,
            relays: existing?.relays || [],
            isOnline: online,
            isMock: existing?.isMock ?? true,
            lastHeartbeat: lastHb,
          };
        });
      });
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Connectivity refresh failed', err);
      setServerOnline(false);
    }
  };

  const fetchRevenueData = async () => {
    if (!laundryIdKey) {
      setRevenueEntries({});
      setRevenueDrafts({});
      setRevenueAudit({});
      setRevenueSummary(null);
      return;
    }
    setRevenueLoading(true);
    setRevenueError(null);
    try {
      const date = revenueDate;
      const results = await Promise.all(laundries.map(async (laundry) => {
        const response = await ApiService.getRevenueEntry(laundry.id, date);
        return {
          agentId: laundry.id,
          entry: response?.entry ?? null,
          audit: response?.audit ?? [],
        };
      }));
      const entryMap: Record<string, RevenueEntry | null> = {};
      const draftMap: Record<string, RevenueDraft> = {};
      const auditMap: Record<string, RevenueAuditEntry[]> = {};
      results.forEach(({ agentId: id, entry, audit }) => {
        entryMap[id] = entry;
        draftMap[id] = buildRevenueDraft(entry || null);
        auditMap[id] = audit || [];
      });
      setRevenueEntries(entryMap);
      setRevenueDrafts(draftMap);
      setRevenueAudit(auditMap);
      setRevenueSaveErrors({});
      const summary = await ApiService.getRevenueSummary(date);
      setRevenueSummary(summary);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Revenue fetch failed', err);
      setRevenueError('Unable to load revenue data.');
    } finally {
      setRevenueLoading(false);
    }
  };

  const fetchRevenueEntryDates = async () => {
    const range = getMonthRange(revenueDate);
    if (!range) {
      setRevenueEntryDates([]);
      return;
    }
    try {
      const dates = await ApiService.listRevenueEntryDates(range.startDate, range.endDate);
      setRevenueEntryDates(dates);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Revenue calendar fetch failed', err);
      setRevenueEntryDates([]);
    }
  };

  const fetchAllRevenueEntries = async () => {
    setRevenueAllLoading(true);
    setRevenueAllError(null);
    try {
      const entries = await ApiService.listRevenueEntries();
      setRevenueAllEntries(entries);
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Revenue list fetch failed', err);
      setRevenueAllError('Unable to load revenue entries.');
    } finally {
      setRevenueAllLoading(false);
    }
  };

  const handleExportRevenueCsv = () => {
    const laundryNameMap = new Map(laundries.map(l => [l.id, l.name]));
    exportRevenueToCsv(revenueAllEntries, laundryNameMap);
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    fetchLaundries();
    const poller = setInterval(() => {
      if (isRelayEditModeRef.current || editingGroupIdRef.current) {
        refreshConnectivityOnly();
        return;
      }
      fetchLaundries();
    }, 2000);
    return () => clearInterval(poller);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchCameras();
  }, [isAuthenticated, laundryIdKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => {
      fetchCameras();
    }, 30_000);
    return () => clearInterval(timer);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || activeTab !== Tab.DASHBOARD || !isPageVisible) return;
    const timer = setInterval(() => {
      setCameraRefreshTick((prev) => prev + 1);
    }, CAMERA_FRAME_REFRESH_MS);
    return () => clearInterval(timer);
  }, [isAuthenticated, activeTab, isPageVisible]);

  // Fetch inventory when inventory tab is active
  useEffect(() => {
    if (!isAuthenticated || activeTab !== Tab.INVENTORY) return;
    fetchInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTab]);

  useEffect(() => {
    if (!Object.keys(cameraWarmup).length) return;
    const now = Date.now();
    setCameraWarmup(prev => {
      let next = prev;
      Object.entries(prev).forEach(([key, startedAt]) => {
        if (now - startedAt > CAMERA_WARMUP_MS) {
          if (next === prev) next = { ...prev };
          delete next[key];
        }
      });
      return next;
    });
  }, [cameraRefreshTick, cameraConfigs]);

  useEffect(() => {
    if (!isAuthenticated || activeTab !== Tab.DASHBOARD || !isPageVisible) return;
    if (typeof Image === 'undefined') return;
    laundries.forEach(laundry => {
      const online = isLaundryOnline(laundry);
      const cameras = getCameraSlots(laundry.id);
      cameras.forEach(camera => {
        const key = cameraDraftKey(laundry.id, camera.id);
        const inView = cameraVisibility[key];
        const shouldPollCamera = isPageVisible && (inView ?? true);
        const canRequestPreview = camera.enabled && shouldPollCamera && (camera.sourceType === 'pattern' || online);
        if (!canRequestPreview) return;
        // Update the frame source URL directly - browser handles image loading and HTTP caching
        const src = buildCameraPreviewUrl(camera, laundry.id, { cacheBust: true });
        setCameraFrameSources(prev => (prev[key] === src ? prev : { ...prev, [key]: src }));
      });
    });
  }, [
    activeTab,
    cameraConfigs,
    cameraRefreshTick,
    cameraVisibility,
    isAuthenticated,
    isPageVisible,
    laundries,
    isLaundryOnline,
    primaryAgentId,
  ]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleVisibility = () => {
      setIsPageVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver((entries) => {
      setCameraVisibility((prev) => {
        let next = prev;
        entries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          const key = target.dataset.cameraKey;
          if (!key) return;
          const visible = entry.isIntersecting;
          if (prev[key] === visible) return;
          if (next === prev) next = { ...prev };
          next[key] = visible;
        });
        return next;
      });
    }, { rootMargin: '120px 0px', threshold: 0.1 });
    cameraObserverRef.current = observer;
    cameraCardRefs.current.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
      cameraObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    laundriesRef.current = laundries;
  }, [laundries]);

  useEffect(() => {
    isRelayEditModeRef.current = isRelayEditMode;
  }, [isRelayEditMode]);

  useEffect(() => {
    editingGroupIdRef.current = editingGroupId;
  }, [editingGroupId]);

  useEffect(() => {
    if (!isRelayEditMode && !editingGroupId) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('[data-edit-toggle]')) return;

      const relayInside = relayEditAreaRef.current?.contains(target);
      const groupInside = groupEditAreaRef.current?.contains(target);

      if (isRelayEditMode && !relayInside) {
        setIsRelayEditMode(false);
        fetchLaundries(true);
      }
      if (editingGroupId && !groupInside) {
        setEditingGroupId(null);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isRelayEditMode, editingGroupId, fetchLaundries]);

  useEffect(() => {
    relayVisibilityRef.current = relayVisibility;
  }, [relayVisibility]);

  useEffect(() => {
    if (!isAuthenticated || authUser?.role !== 'admin') return;
    if (activeTab !== Tab.REVENUE || revenueView !== 'daily') return;
    fetchRevenueData();
  }, [activeTab, revenueDate, laundryIdKey, isAuthenticated, authUser?.role, revenueView]);

  useEffect(() => {
    if (!isAuthenticated || authUser?.role !== 'admin') return;
    if (activeTab !== Tab.REVENUE || revenueView !== 'daily') return;
    fetchRevenueEntryDates();
  }, [activeTab, revenueDate, laundryIdKey, isAuthenticated, authUser?.role, revenueView]);

  useEffect(() => {
    if (!isAuthenticated || authUser?.role !== 'admin') return;
    if (activeTab !== Tab.REVENUE || revenueView !== 'all') return;
    fetchAllRevenueEntries();
  }, [activeTab, revenueView, isAuthenticated, authUser?.role]);

  useEffect(() => {
    if (!isAuthenticated || authUser?.role !== 'admin') return;
    if (activeTab !== Tab.SETTINGS) return;
    fetchUsersFromHook(handleAuthFailure);
  }, [activeTab, isAuthenticated, authUser?.role, fetchUsersFromHook, handleAuthFailure]);

  useEffect(() => {
    const primary = laundries[0];
    if (primary) {
      setRelays(primary.relays);
      setIsMockMode(primary.isMock);
      setAgentId(primary.id);
      setAgentHeartbeat(primary.lastHeartbeat);
    } else {
      setRelays([]);
      setAgentId(null);
      setAgentHeartbeat(null);
      setIsMockMode(true);
    }
  }, [laundries]);

  // Sync drafts and visibility
  useEffect(() => {
    // Only prefill new-group selection when untouched (avoid clobbering user edits on polls)
    if (!groupSelectionTouched && newGroupSelections.length === 0 && laundries.length) {
      const visible = laundries.flatMap(l =>
        (l.relays || []).filter(r => !r.isHidden).map(r => ({ agentId: l.id, relayId: r.id }))
      );
      setNewGroupSelections(dedupeSelections(visible));
    }
    // Avoid overwriting draft names while in relay edit mode
    if (!isRelayEditMode) {
      const drafts: Record<string, string> = {};
      const visibility: Record<string, boolean> = {};
      laundries.forEach(l => {
        (l.relays || []).forEach(r => {
          const key = relayDraftKey(l.id, r.id);
          drafts[key] = r.name;
          visibility[key] = Boolean(r.isHidden);
        });
      });
      setRelayNameDrafts(drafts);
      setRelayVisibility(visibility);
    }
    // Adjust default new group times to empty if server provided meta without times
    if (!groupSelectionTouched && !newGroupOnTime && !newGroupOffTime) {
      setNewGroupOnTime('');
      setNewGroupOffTime('');
    }
    console.log('[LaundroPi] relays loaded:', relays.length, 'visible:', relays.filter(r => !r.isHidden).length);
  }, [relays, laundries, newGroupSelections.length, groupSelectionTouched, isRelayEditMode, newGroupOnTime, newGroupOffTime]);

  // Drop hidden relays from schedules
  useEffect(() => {
    if (!relays.length) return;
    setSchedules(prev => prev.map(s => ({
      ...s,
      relayIds: s.relayIds.filter(id => {
        const relay = relays.find(r => r.id === id);
        return relay && !relay.isHidden;
      })
    })));
  }, [relays]);

  // Drop hidden relays from groups so toggles don't touch hidden devices
  useEffect(() => {
    if (!laundries.length) return;
    const visibleMap = new Map<string, Set<number>>();
    laundries.forEach(l => {
      visibleMap.set(l.id, new Set((l.relays || []).filter(r => !r.isHidden).map(r => r.id)));
    });
    setGroups(prev => prev.map(g => {
      const entries = (g.entries || []).map(e => {
        const allowed = visibleMap.get(e.agentId);
        const relayIds = allowed ? e.relayIds.filter(id => allowed.has(id)) : [];
        return { ...e, relayIds };
      }).filter(e => e.relayIds.length);
      return { ...g, entries, relayIds: entries.flatMap(e => e.relayIds) };
    }));
  }, [laundries]);

  const updateLaundryRelays = (id: string, updater: (relays: Relay[]) => Relay[]) => {
    setLaundries(prev => prev.map(l => l.id === id ? { ...l, relays: updater(l.relays) } : l));
  };

  const handleAddLaundry = async () => {};

  const handleRemoveLaundry = (_id: string) => {};

  const handleRenameLaundry = async (_id: string, _name: string) => {};

  const handleToggleRelay = async (id: number, agent: string = primaryAgentId) => {
    if (!serverOnline) return;
    const laundry = laundries.find(l => l.id === agent);
    const current = laundry?.relays.find(r => r.id === id);
    const nextState = current?.isOn ? 'OFF' : 'ON';
    markPendingRelayState(agent, id, nextState === 'ON');
    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => prev.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r));
      latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, isOn: !r.isOn } : r);
    }
    await ApiService.setRelayState(agent, id, nextState === 'ON' ? 'on' : 'off');
    fetchLaundries(true);
  };

  const handleBatchControl = async (ids: number[], action: 'ON' | 'OFF', agent: string = primaryAgentId) => {
    if (!serverOnline) return;
    const laundry = laundries.find(l => l.id === agent);
    const allowedIds = laundry
      ? new Set((laundry.relays || []).filter(r => !r.isHidden).map(r => r.id))
      : null;
    const targetIds = allowedIds ? ids.filter(id => allowedIds.has(id)) : ids;
    if (!targetIds.length) return;
    targetIds.forEach(id => markPendingRelayState(agent, id, action === 'ON'));
    updateLaundryRelays(agent, rels => rels.map(r => targetIds.includes(r.id) ? { ...r, isOn: action === 'ON' } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => {
        const next = prev.map(r => targetIds.includes(r.id) ? { ...r, isOn: action === 'ON' } : r);
        const merged = applyVisibility(agent, next);
        latestRelaysRef.current = merged;
        return merged;
      });
    }
    await ApiService.batchControl(agent, targetIds, action);
  };

  const handleRenameRelay = async (id: number, agent: string = primaryAgentId) => {
    if (!serverOnline) return;
    const name = (relayNameDrafts[relayDraftKey(agent, id)] || '').trim();
    if (!name) return;
    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, name } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => prev.map(r => r.id === id ? { ...r, name } : r));
    }
    await ApiService.renameRelay(agent, id, name);
    // keep latest ref in sync so exiting edit doesn't revert names
    latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, name } : r);
  };

  const handleRelayNameInput = (agentId: string, id: number, name: string) => {
    const key = relayDraftKey(agentId, id);
    setRelayNameDrafts(prev => ({ ...prev, [key]: name }));
  };

  const handleCameraNameInput = (agentId: string, cameraId: string, name: string) => {
    const key = cameraDraftKey(agentId, cameraId);
    setCameraNameDrafts(prev => ({ ...prev, [key]: name }));
    setCameraSaveErrors(prev => ({ ...prev, [key]: null }));
  };

  const handleCameraNameSave = async (agentId: string, cameraId: string) => {
    const key = cameraDraftKey(agentId, cameraId);
    const name = (cameraNameDrafts[key] || '').trim();
    if (!name) {
      setCameraSaveErrors(prev => ({ ...prev, [key]: 'Camera name is required.' }));
      return;
    }
    setCameraSaving(prev => ({ ...prev, [key]: true }));
    setCameraSaveErrors(prev => ({ ...prev, [key]: null }));
    try {
      const res = await ApiService.updateCamera(agentId, cameraId, { name });
      setCameraConfigs(prev => {
        const list = prev[agentId] || [];
        const nextList = list.map(cam => cam.id === cameraId ? { ...cam, name: res.camera.name } : cam);
        // Only update if actually changed
        const hasChanges = JSON.stringify(list) !== JSON.stringify(nextList);
        return hasChanges ? { ...prev, [agentId]: nextList } : prev;
      });
      setCameraNameDrafts(prev => ({ ...prev, [key]: res.camera.name }));
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Camera rename failed', err);
      setCameraSaveErrors(prev => ({ ...prev, [key]: 'Failed to update camera name.' }));
    } finally {
      setCameraSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleCameraEnabledToggle = async (agentId: string, camera: CameraConfig) => {
    if (!serverOnline) return;
    const key = cameraDraftKey(agentId, camera.id);
    const list = cameraConfigs[agentId] || [];
    const current = list.find(cam => cam.id === camera.id) || camera;
    const currentEnabled = current.enabled;
    const nextEnabled = !currentEnabled;
    const useToggleLoading = camera.sourceType !== 'pattern';
    setCameraSaving(prev => ({ ...prev, [key]: true }));
    if (useToggleLoading) {
      setCameraToggleLoading(prev => ({ ...prev, [key]: true }));
    }
    setCameraSaveErrors(prev => ({ ...prev, [key]: null }));
    setCameraWarmup(prev => {
      if (!nextEnabled || camera.sourceType === 'pattern') {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: Date.now() };
    });
    if (nextEnabled) {
      setCameraPreviewErrors(prev => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setCameraFrameSources(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCameraConfigs(prev => {
      const existing = prev[agentId] || [];
      const found = existing.some(cam => cam.id === camera.id);
      const nextList = found
        ? existing.map(cam => cam.id === camera.id ? { ...cam, enabled: nextEnabled } : cam)
        : [...existing, { ...camera, enabled: nextEnabled }];
      // Only update if actually changed
      const hasChanges = JSON.stringify(existing) !== JSON.stringify(nextList);
      return hasChanges ? { ...prev, [agentId]: nextList } : prev;
    });
    try {
      const res = await ApiService.updateCamera(agentId, camera.id, { enabled: nextEnabled });
      setCameraConfigs(prev => {
        const existing = prev[agentId] || [];
        const found = existing.some(cam => cam.id === camera.id);
        const nextList = found
          ? existing.map(cam => cam.id === camera.id ? { ...cam, enabled: res.camera.enabled } : cam)
          : [...existing, { ...camera, enabled: res.camera.enabled }];
        // Only update if actually changed
        const hasChanges = JSON.stringify(existing) !== JSON.stringify(nextList);
        return hasChanges ? { ...prev, [agentId]: nextList } : prev;
      });
      // No need to fetchCameras() - we already updated the state above
    } catch (err) {
      if (handleAuthFailure(err)) return;
      console.error('Camera enable toggle failed', err);
      setCameraConfigs(prev => {
        const existing = prev[agentId] || [];
        const found = existing.some(cam => cam.id === camera.id);
        const nextList = found
          ? existing.map(cam => cam.id === camera.id ? { ...cam, enabled: currentEnabled } : cam)
          : [...existing, { ...camera, enabled: currentEnabled }];
        // Only update if actually changed
        const hasChanges = JSON.stringify(existing) !== JSON.stringify(nextList);
        return hasChanges ? { ...prev, [agentId]: nextList } : prev;
      });
      setCameraSaveErrors(prev => ({ ...prev, [key]: 'Failed to update camera state.' }));
      setCameraWarmup(prev => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    } finally {
      setCameraSaving(prev => ({ ...prev, [key]: false }));
      if (useToggleLoading) {
        setCameraToggleLoading(prev => ({ ...prev, [key]: false }));
      }
    }
  };

  const handleToggleVisibility = async (id: number, agent: string = primaryAgentId) => {
    if (!serverOnline) return;
    const key = relayDraftKey(agent, id);
    const currentHidden = relayVisibility[key];
    const fallbackHidden = laundries.find(l => l.id === agent)?.relays.find(r => r.id === id)?.isHidden ?? false;
    const nextHidden = currentHidden === undefined ? !fallbackHidden : !currentHidden;
    setRelayVisibility(prev => ({ ...prev, [key]: nextHidden }));
    relayVisibilityRef.current = { ...relayVisibilityRef.current, [key]: nextHidden };
    // Update relays locally; if unhidden, default to OFF
    if (agent === primaryAgentId) {
      setRelays(prev => {
        const next = prev.map(r => {
          if (r.id !== id) return r;
          return { ...r, isHidden: nextHidden, isOn: nextHidden ? r.isOn : false };
        });
        latestRelaysRef.current = next;
        return next;
      });
      // Adjust schedules
      setSchedules(prev => prev.map(s => ({ ...s, relayIds: s.relayIds.filter(rid => rid !== id) })));

      // Adjust groups: remove hidden relay; add back to all groups when unhidden
      setGroups(prev => {
        const updatedGroups = prev.map(g => {
          const hasEntry = (g.entries || []).some(e => e.agentId === agent);
          let nextEntries = (g.entries || []).map(e => {
            if (e.agentId !== agent) return e;
            const has = e.relayIds.includes(id);
            if (nextHidden && has) {
              return { ...e, relayIds: e.relayIds.filter(rid => rid !== id) };
            }
            if (!nextHidden && !has) {
              return { ...e, relayIds: [...e.relayIds, id] };
            }
            return e;
          }).filter(e => e.relayIds.length);
          if (!nextHidden && !hasEntry) {
            nextEntries = [...nextEntries, { agentId: agent, relayIds: [id] }];
          }
          return { ...g, entries: nextEntries, relayIds: nextEntries.flatMap(e => e.relayIds) };
        });
        // Persist changes to server asynchronously
        updatedGroups.forEach((g, idx) => {
          const prevGroup = prev[idx];
          if (JSON.stringify(prevGroup?.entries || []) !== JSON.stringify(g.entries || [])) {
            handleUpdateGroupFromHook(g.id, { entries: g.entries }, primaryAgentId, laundries, to24h, normalizeGroupPayload);
          }
        });
        return updatedGroups;
      });
    }

    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, isHidden: nextHidden } : r));

    const updated = await ApiService.setRelayVisibility(agent, id, nextHidden);
    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => prev.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r));
      latestRelaysRef.current = latestRelaysRef.current.map(r => r.id === id ? { ...r, isHidden: updated.isHidden } : r);
    }
    await fetchLaundries(true);
  };

  const handleIconChange = async (id: number, iconType: Relay['iconType'], agent: string = primaryAgentId) => {
    if (!iconType) return;
    updateLaundryRelays(agent, rels => rels.map(r => r.id === id ? { ...r, iconType } : r));
    if (agent === primaryAgentId) {
      setRelays(prev => prev.map(r => r.id === id ? { ...r, iconType } : r));
    }
    await ApiService.setRelayIcon(agent, id, iconType as RelayType);
  };

  const showCameraLoading = cameraLoading && Object.keys(cameraConfigs).length === 0;

  // Wrapper functions for group operations
  const handleAddGroup = () => handleAddGroupFromHook(primaryAgentId, to24h, normalizeGroupPayload, setActiveTab);
  const handleUpdateGroup = (groupId: string, updates: Partial<RelayGroup>) =>
    handleUpdateGroupFromHook(groupId, updates, primaryAgentId, laundries, to24h, normalizeGroupPayload);
  const handleDeleteGroup = (id: string) => handleDeleteGroupFromHook(id, primaryAgentId);
  const handleToggleGroupPower = (id: string, action: 'ON' | 'OFF') =>
    handleToggleGroupPowerFromHook(id, action, primaryAgentId, serverOnline, markPendingRelayState, updateLaundryRelays, setRelays, latestRelaysRef, handleAuthFailure);

  const renderDashboard = () => (
    <DashboardView
      laundries={laundries}
      isRelayEditMode={isRelayEditMode}
      setIsRelayEditMode={setIsRelayEditMode}
      serverOnline={serverOnline}
      cameraError={cameraError}
      showCameraLoading={showCameraLoading}
      relayEditAreaRef={relayEditAreaRef}
      isLaundryOnline={isLaundryOnline}
      getCameraSlots={getCameraSlots}
      handleBatchControl={handleBatchControl}
      handleToggleRelay={handleToggleRelay}
      relayNameDrafts={relayNameDrafts}
      relayDraftKey={relayDraftKey}
      handleRelayNameInput={handleRelayNameInput}
      handleRenameRelay={handleRenameRelay}
      handleToggleVisibility={handleToggleVisibility}
      handleIconChange={handleIconChange}
      cameraDraftKey={cameraDraftKey}
      cameraNameDrafts={cameraNameDrafts}
      cameraSaving={cameraSaving}
      cameraToggleLoading={cameraToggleLoading}
      cameraSaveErrors={cameraSaveErrors}
      cameraVisibility={cameraVisibility}
      isPageVisible={isPageVisible}
      cameraFrameSources={cameraFrameSources}
      buildCameraPreviewUrl={buildCameraPreviewUrl}
      cameraWarmup={cameraWarmup}
      CAMERA_WARMUP_MS={CAMERA_WARMUP_MS}
      handleCameraNameInput={handleCameraNameInput}
      handleCameraEnabledToggle={handleCameraEnabledToggle}
      handleCameraNameSave={handleCameraNameSave}
      getCameraCardRef={getCameraCardRef}
      fetchLaundries={fetchLaundries}
    />
  );

  const renderScheduler = () => (
    <SchedulesView
      laundries={laundries}
      newGroupSelections={newGroupSelections}
      newGroupName={newGroupName}
      newGroupOnTime={newGroupOnTime}
      newGroupOffTime={newGroupOffTime}
      newGroupDays={newGroupDays}
      isNewGroupVisible={isNewGroupVisible}
      groups={groups}
      editingGroupId={editingGroupId}
      controlsDisabled={controlsDisabled}
      groupSelectionTouched={groupSelectionTouched}
      serverOnline={serverOnline}
      groupEditAreaRef={groupEditAreaRef}
      DAYS_OF_WEEK={DAYS_OF_WEEK}
      setIsNewGroupVisible={setIsNewGroupVisible}
      setNewGroupName={setNewGroupName}
      setNewGroupSelections={setNewGroupSelections}
      setNewGroupOnTime={setNewGroupOnTime}
      setNewGroupOffTime={setNewGroupOffTime}
      setNewGroupDays={setNewGroupDays}
      setGroups={setGroups}
      setEditingGroupId={setEditingGroupId}
      setGroupSelectionTouched={setGroupSelectionTouched}
      isLaundryOnline={isLaundryOnline}
      selectionKey={selectionKey}
      dedupeSelections={dedupeSelections}
      normalizeTimeInput={normalizeTimeInput}
      to24h={to24h}
      handleAddGroup={handleAddGroup}
      handleUpdateGroup={handleUpdateGroup}
      handleDeleteGroup={handleDeleteGroup}
      handleToggleGroupPower={handleToggleGroupPower}
    />
  );

  // Wrapper function for getLatestAudit that needs revenueAudit context
  const getLatestAuditWrapper = (agentId: string, field: string) =>
    getLatestAudit(revenueAudit, agentId, field);

  const renderRevenue = () => (
    <RevenueView
      authUser={authUser}
      laundries={laundries}
      revenueView={revenueView}
      setRevenueView={setRevenueView}
      revenueDate={revenueDate}
      setRevenueDate={setRevenueDate}
      isRevenueCalendarOpen={isRevenueCalendarOpen}
      setIsRevenueCalendarOpen={setIsRevenueCalendarOpen}
      revenueEntryDates={revenueEntryDates}
      revenueEntries={revenueEntries}
      revenueLoading={revenueLoading}
      revenueError={revenueError}
      revenueSummary={revenueSummary}
      revenueSaveErrors={revenueSaveErrors}
      revenueSaving={revenueSaving}
      revenueDrafts={revenueDrafts}
      revenueAudit={revenueAudit}
      revenueAllEntries={revenueAllEntries}
      revenueAllLoading={revenueAllLoading}
      revenueAllError={revenueAllError}
      DAYS_OF_WEEK={DAYS_OF_WEEK}
      getMonthRange={getMonthRange}
      shiftDateByDays={shiftDateByDays}
      shiftDateByMonths={shiftDateByMonths}
      formatMoney={formatMoney}
      formatTimestamp={formatTimestamp}
      buildRevenueDraft={buildRevenueDraft}
      updateRevenueDraftFromHook={updateRevenueDraftFromHook}
      isRevenueNumericInput={isRevenueNumericInput}
      getLatestAudit={getLatestAuditWrapper}
      getDeductionSummary={getDeductionSummary}
      addRevenueDeductionFromHook={addRevenueDeductionFromHook}
      removeRevenueDeductionFromHook={removeRevenueDeductionFromHook}
      handleRevenueSaveFromHook={handleRevenueSaveFromHook}
      handleExportRevenueCsv={handleExportRevenueCsv}
    />
  );

  const renderSystem = () => (
    <SettingsView
      authUser={authUser}
      users={users}
      usersLoading={usersLoading}
      usersError={usersError}
      userCreateError={userCreateError}
      userCreateLoading={userCreateLoading}
      newUserName={newUserName}
      newUserPassword={newUserPassword}
      newUserRole={newUserRole}
      userRoleDrafts={userRoleDrafts}
      userPasswordDrafts={userPasswordDrafts}
      userSaving={userSaving}
      userSaveErrors={userSaveErrors}
      setNewUserName={setNewUserName}
      setNewUserPassword={setNewUserPassword}
      setNewUserRole={setNewUserRole}
      setUserRoleDrafts={setUserRoleDrafts}
      setUserPasswordDrafts={setUserPasswordDrafts}
      fetchUsers={() => fetchUsersFromHook(handleAuthFailure)}
      handleCreateUserFromHook={handleCreateUserFromHook}
      handleRoleSaveFromHook={handleRoleSaveFromHook}
      handlePasswordSaveFromHook={handlePasswordSaveFromHook}
      handleAuthFailure={handleAuthFailure}
      formatLastLogin={formatLastLogin}
    />
  );

  if (!isAuthReady) {
    return <LoadingScreen message="Checking session..." />;
  }

  if (!isAuthenticated) {
    return (
      <LoginForm
        authLogin={authLogin}
        authPassword={authPassword}
        authError={authError}
        brandLogoUrl={BRAND_LOGO_URL}
        setAuthLogin={setAuthLogin}
        setAuthPassword={setAuthPassword}
        handleLoginSubmit={handleLoginSubmit}
      />
    );
  }

  if (isLoading && laundries.length === 0) {
    console.log('[LaundroPi] render branch: loading screen', { isLoading, relaysLen: relays.length, activeTab });
    return <LoadingScreen message="Loading LaundroPi..." />;
  }

  console.log('[LaundroPi] render branch: main UI', { isLoading, relaysLen: relays.length, activeTab, schedulesLen: schedules.length });
  return (
    <div className="min-h-screen pb-24 overflow-x-hidden">
      <Header
        brandLogoUrl={BRAND_LOGO_URL}
        laundries={laundries}
        isLaundryOnline={isLaundryOnline}
        authUser={authUser}
        currentTime={currentTime}
        handleLogout={handleLogout}
      />

      <main className="max-w-full sm:max-w-3xl w-full mx-auto px-3 sm:px-4 py-6 overflow-hidden box-border">
        <OfflineMessages messages={offlineMessages} />
        {activeTab === Tab.DASHBOARD && renderDashboard()}
        {activeTab === Tab.SCHEDULE && renderScheduler()}
        {activeTab === Tab.REVENUE && renderRevenue()}
        {activeTab === Tab.INVENTORY && (
          <InventoryView
            laundries={laundries}
            inventory={inventory}
            lastChanges={lastChanges}
            onUpdateQuantity={updateQuantity}
            onViewAudit={viewAudit}
            auditLog={auditLog}
            showingAuditFor={showingAuditFor}
            onCloseAudit={closeAudit}
          />
        )}
        {activeTab === Tab.SETTINGS && renderSystem()}
      </main>

      <BottomNavigation
        activeTab={activeTab}
        authUser={authUser}
        setActiveTab={setActiveTab}
      />
    </div>
  );
};

export default App;
// Test helpers
export const __timeHelpers = { to24h, normalizeTimeInput };
export const __revenueHelpers = { isRevenueNumericInput };
