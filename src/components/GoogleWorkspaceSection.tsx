import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  Unplug,
  X,
  GripVertical,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  GoogleAuthorizedResource,
  GoogleResourceServiceKey,
  GoogleWorkspaceConfig,
  GoogleWorkspaceIntegrationStatus,
  GoogleWorkspaceServiceIdentifier,
} from '../types';
import {
  GoogleWorkspaceLogo,
  GoogleSheetsLogo,
  GoogleCalendarLogo,
} from './BrandLogos';
import {
  createEmptyGoogleConnectionsMap,
  disconnectGoogleWorkspaceIntegration,
  getGoogleWorkspaceIntegrationConnections,
  GOOGLE_WORKSPACE_SERVICE_MAP,
  GoogleIntegrationConnectionRecord,
  GoogleWorkspaceUiKey,
  processGoogleWorkspaceOAuthCallbackFromUrl,
  startGoogleWorkspaceOAuth,
  syncGoogleWorkspaceConfigWithRecords,
} from '../lib/supabaseService';
import {
  useGoogleSelectedResources,
  UseGoogleSelectedResourcesReturn,
} from '../hooks/useGoogleSelectedResources';
import {
  AuthorizedResourcesSection,
  RemoveGoogleResourceModal,
} from './AuthorizedResourcesSection';
import { GoogleSheetTabsSelector } from './GoogleSheetTabsSelector';

interface GoogleWorkspaceSectionProps {
  value?: GoogleWorkspaceConfig;
  onChange?: (config: GoogleWorkspaceConfig) => void;
  workspaceId?: string | null;
  agentId?: string | null;
  compact?: boolean;
}

interface DisconnectTarget {
  key: GoogleWorkspaceUiKey;
  service: GoogleWorkspaceServiceIdentifier;
  name: string;
  logo: React.FC<{ className?: string }>;
  email?: string;
  connectionId: string;
  workspaceId: string | null;
}

type VisibleGoogleWorkspaceAppKey = 'sheets' | 'calendar';

const DEFAULT_GOOGLE_APPS_ORDER: readonly VisibleGoogleWorkspaceAppKey[] = [
  'sheets',
  'calendar',
] as const;

const GOOGLE_APPS_ORDER_STORAGE_KEY = 'zivofly_google_workspace_apps_order_v1';

function sanitizeGoogleAppsOrder(raw: unknown): VisibleGoogleWorkspaceAppKey[] {
  const validSet = new Set<string>(DEFAULT_GOOGLE_APPS_ORDER);
  const cleaned: VisibleGoogleWorkspaceAppKey[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (
        typeof item === 'string' &&
        validSet.has(item) &&
        !cleaned.includes(item as VisibleGoogleWorkspaceAppKey)
      ) {
        cleaned.push(item as VisibleGoogleWorkspaceAppKey);
      }
    }
  }
  for (const key of DEFAULT_GOOGLE_APPS_ORDER) {
    if (!cleaned.includes(key)) {
      cleaned.push(key);
    }
  }
  return cleaned;
}

function loadGoogleAppsOrder(workspaceId?: string | null): VisibleGoogleWorkspaceAppKey[] {
  try {
    const keysToTry = workspaceId
      ? [`${GOOGLE_APPS_ORDER_STORAGE_KEY}_${workspaceId}`, GOOGLE_APPS_ORDER_STORAGE_KEY]
      : [GOOGLE_APPS_ORDER_STORAGE_KEY];
    for (const storageKey of keysToTry) {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return sanitizeGoogleAppsOrder(JSON.parse(saved));
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return [...DEFAULT_GOOGLE_APPS_ORDER];
}

function saveGoogleAppsOrder(
  order: VisibleGoogleWorkspaceAppKey[],
  workspaceId?: string | null
): void {
  try {
    const serialized = JSON.stringify(order);
    localStorage.setItem(GOOGLE_APPS_ORDER_STORAGE_KEY, serialized);
    if (workspaceId) {
      localStorage.setItem(`${GOOGLE_APPS_ORDER_STORAGE_KEY}_${workspaceId}`, serialized);
    }
  } catch {
    // Ignore storage write errors
  }
}

export const GoogleWorkspaceSection: React.FC<GoogleWorkspaceSectionProps> = ({
  value,
  onChange,
  workspaceId,
  agentId,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(
    workspaceId || null
  );
  const [connectionsByService, setConnectionsByService] = useState<
    Record<
      GoogleWorkspaceServiceIdentifier,
      GoogleIntegrationConnectionRecord | null
    >
  >(() => createEmptyGoogleConnectionsMap());
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [connectingService, setConnectingService] =
    useState<GoogleWorkspaceServiceIdentifier | null>(null);
  const [disconnectTarget, setDisconnectTarget] =
    useState<DisconnectTarget | null>(null);
  const [disconnectingService, setDisconnectingService] =
    useState<GoogleWorkspaceServiceIdentifier | null>(null);
  const [resourceToRemove, setResourceToRemove] = useState<{
    service: GoogleResourceServiceKey;
    resource: GoogleAuthorizedResource;
  } | null>(null);
  const [oauthDiagnosticError, setOauthDiagnosticError] = useState<{
    appName: string;
    service: GoogleWorkspaceServiceIdentifier;
    title: string;
    message: string;
  } | null>(null);
  const [appOrder, setAppOrder] = useState<VisibleGoogleWorkspaceAppKey[]>(() =>
    loadGoogleAppsOrder(workspaceId)
  );
  const [draggedAppKey, setDraggedAppKey] = useState<VisibleGoogleWorkspaceAppKey | null>(null);
  const [dragOverAppKey, setDragOverAppKey] = useState<VisibleGoogleWorkspaceAppKey | null>(null);
  const [sheetsTabRefreshTrigger, setSheetsTabRefreshTrigger] = useState<number>(0);
  const [sheetsTabRefreshByResource, setSheetsTabRefreshByResource] = useState<
    Record<string, number>
  >({});

  const valueRef = useRef<GoogleWorkspaceConfig | undefined>(value);
  valueRef.current = value;
  const onChangeRef = useRef<typeof onChange>(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setResolvedWorkspaceId(workspaceId || null);
  }, [workspaceId]);

  useEffect(() => {
    if (resolvedWorkspaceId) {
      setAppOrder(loadGoogleAppsOrder(resolvedWorkspaceId));
    }
  }, [resolvedWorkspaceId]);

  const updateAppOrder = useCallback(
    (nextOrder: VisibleGoogleWorkspaceAppKey[]) => {
      const sanitized = sanitizeGoogleAppsOrder(nextOrder);
      setAppOrder(sanitized);
      saveGoogleAppsOrder(sanitized, resolvedWorkspaceId || workspaceId);
    },
    [resolvedWorkspaceId, workspaceId]
  );

  const handleDropApp = useCallback(
    (targetKey: VisibleGoogleWorkspaceAppKey) => {
      if (!draggedAppKey || draggedAppKey === targetKey) {
        setDraggedAppKey(null);
        setDragOverAppKey(null);
        return;
      }
      const fromIdx = appOrder.indexOf(draggedAppKey);
      const toIdx = appOrder.indexOf(targetKey);
      if (fromIdx === -1 || toIdx === -1) {
        setDraggedAppKey(null);
        setDragOverAppKey(null);
        return;
      }
      const next = [...appOrder];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      updateAppOrder(next);
      setDraggedAppKey(null);
      setDragOverAppKey(null);
    },
    [appOrder, draggedAppKey, updateAppOrder]
  );

  const isCustomOrder = appOrder.some(
    (key, idx) => key !== DEFAULT_GOOGLE_APPS_ORDER[idx]
  );

  const applyConnectionsToParent = useCallback(
    (
      nextMap: Record<
        GoogleWorkspaceServiceIdentifier,
        GoogleIntegrationConnectionRecord | null
      >
    ) => {
      setConnectionsByService(nextMap);
      if (onChangeRef.current) {
        const synced = syncGoogleWorkspaceConfigWithRecords(
          valueRef.current,
          nextMap
        );
        onChangeRef.current(synced);
      }
    },
    []
  );

  const getConnectionDerivedState = (service: GoogleResourceServiceKey) => {
    const rec = connectionsByService[service];
    const status: GoogleWorkspaceIntegrationStatus =
      !rec || rec.status === 'disconnected' ? 'disconnected' : rec.status;
    return {
      record: rec,
      status,
      connectionId: status !== 'disconnected' ? rec?.id || null : null,
      workspaceId: rec?.workspace_id || resolvedWorkspaceId || workspaceId || null,
      accountEmail: rec?.account_email || null,
      scopes: rec?.scopes,
    };
  };

  const sheetsState = getConnectionDerivedState('google_sheets_service');

  const handleSheetsResourcesUpdated = useCallback(
    (activeResourceIds: string[]) => {
      if (!onChangeRef.current) return;
      const activeSet = new Set(activeResourceIds);
      const currentSheets = valueRef.current?.sheets;
      if (!currentSheets || !Array.isArray(currentSheets.selectedResourceIds)) {
        return;
      }
      const pruned = currentSheets.selectedResourceIds.filter((id) =>
        activeSet.has(id)
      );
      if (pruned.length !== currentSheets.selectedResourceIds.length) {
        onChangeRef.current({
          ...(valueRef.current || {}),
          sheets: {
            ...currentSheets,
            selectedResourceIds: pruned,
          },
        });
      }
    },
    []
  );

  const sheetsResources = useGoogleSelectedResources({
    service: 'google_sheets_service',
    workspaceId: sheetsState.workspaceId,
    connectionId: sheetsState.connectionId,
    status: sheetsState.status,
    accountEmail: sheetsState.accountEmail,
    connectionScopes: sheetsState.scopes,
    agentId,
    onResourcesUpdated: handleSheetsResourcesUpdated,
  });

  const resourceHooksByService: Partial<
    Record<GoogleResourceServiceKey, UseGoogleSelectedResourcesReturn>
  > = {
    google_sheets_service: sheetsResources,
  };

  const handleConfirmRemoveResource = useCallback(async () => {
    if (!resourceToRemove) return;
    const hook = resourceHooksByService[resourceToRemove.service];
    if (!hook || hook.removingResourceId) return;
    const removed = await hook.removeResource(resourceToRemove.resource);
    if (removed) {
      setResourceToRemove(null);
    }
  }, [resourceToRemove, sheetsResources]);

  // Close confirmation modal on Escape key when not actively disconnecting
  useEffect(() => {
    if (!disconnectTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disconnectingService) {
        setDisconnectTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disconnectTarget, disconnectingService]);

  // Load real connection statuses from `public.integration_connections` and handle any OAuth callback query params
  useEffect(() => {
    let cancelled = false;

    const initializeGoogleIntegrations = async () => {
      setIsLoadingStatus(true);
      try {
        // 1. Check if the browser URL contains a Google OAuth callback (?google_oauth=success|error)
        const callbackRes = await processGoogleWorkspaceOAuthCallbackFromUrl({
          workspaceId,
          agentId,
        });

        if (cancelled) return;

        if (callbackRes.handled) {
          if (callbackRes.workspaceId) {
            setResolvedWorkspaceId(callbackRes.workspaceId);
          }
          if (callbackRes.connectionsByService) {
            applyConnectionsToParent(callbackRes.connectionsByService);
          }
          if (callbackRes.outcome === 'success') {
            setOauthDiagnosticError(null);
            toast.success(
              callbackRes.message ||
                `Connected ${callbackRes.serviceLabel || 'Google Workspace'} successfully!`
            );
          } else if (callbackRes.outcome === 'error') {
            const errMessage =
              callbackRes.message ||
              'Google Workspace authorization could not be completed.';
            setOauthDiagnosticError({
              appName: callbackRes.serviceLabel || 'Google Workspace',
              service: callbackRes.service || 'google_sheets_service',
              title: `${callbackRes.serviceLabel || 'Google Workspace'} Connection Error`,
              message: errMessage,
            });
            toast.error(errMessage, { duration: 8000 });
          }
          // If callback already fetched fresh connections from Supabase, we are up to date
          if (callbackRes.connectionsByService) {
            return;
          }
        }

        // 2. Query actual connection records from `public.integration_connections`
        const {
          workspaceId: verifiedWsId,
          connectionsByService: freshMap,
        } = await getGoogleWorkspaceIntegrationConnections({
          workspaceId,
          agentId,
        });

        if (!cancelled) {
          setResolvedWorkspaceId(verifiedWsId);
          applyConnectionsToParent(freshMap);
        }
      } catch (err: any) {
        // If user is not authenticated yet, keep default disconnected map without inventing records
        if (!cancelled) {
          setConnectionsByService(createEmptyGoogleConnectionsMap());
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStatus(false);
        }
      }
    };

    void initializeGoogleIntegrations();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, agentId, applyConnectionsToParent]);

  const getAppRecordState = (
    key: GoogleWorkspaceUiKey
  ): {
    service: GoogleWorkspaceServiceIdentifier;
    status: GoogleWorkspaceIntegrationStatus;
    connectionId?: string;
    workspaceId: string | null;
    email?: string;
    lastError?: string | null;
  } => {
    const service = GOOGLE_WORKSPACE_SERVICE_MAP[key];
    const record = connectionsByService[service];
    if (!record || record.status === 'disconnected') {
      return {
        service,
        status: 'disconnected',
        connectionId: undefined,
        workspaceId: record?.workspace_id || resolvedWorkspaceId || workspaceId || null,
        email: undefined,
        lastError: null,
      };
    }

    return {
      service,
      status: record.status,
      connectionId: record.id,
      workspaceId: record.workspace_id || resolvedWorkspaceId || workspaceId || null,
      email: record.account_email || undefined,
      lastError: record.last_error || null,
    };
  };

  const appsByKey: Record<
    VisibleGoogleWorkspaceAppKey,
    {
      key: VisibleGoogleWorkspaceAppKey;
      service: GoogleWorkspaceServiceIdentifier;
      name: string;
      logo: React.FC<{ className?: string }>;
      description: string;
      status: GoogleWorkspaceIntegrationStatus;
      isConnected: boolean;
      connectionId?: string;
      workspaceId: string | null;
      email?: string;
      lastError?: string | null;
    }
  > = {
    sheets: {
      key: 'sheets',
      name: 'Google Sheets',
      logo: GoogleSheetsLogo,
      description:
        'Sync live product catalogues, pricing lists, or capture leads directly into your Google spreadsheets.',
      ...getAppRecordState('sheets'),
      isConnected: getAppRecordState('sheets').status === 'connected',
    },
    calendar: {
      key: 'calendar',
      name: 'Google Calendar',
      logo: GoogleCalendarLogo,
      description:
        'Check real-time slot availability, schedule customer bookings, and dispatch Google Meet invites.',
      ...getAppRecordState('calendar'),
      isConnected: getAppRecordState('calendar').status === 'connected',
    },
  };

  const apps = appOrder.map((key) => appsByKey[key]);

  const connectedCount = apps.filter((app) => app.isConnected).length;

  const handleToggleAgentResource = useCallback(
    (_service: GoogleResourceServiceKey, resourceId: string) => {
      if (!onChangeRef.current) return;

      const activeIds = sheetsResources.resources.map((r) => r.id);
      const currentSelected = Array.isArray(
        valueRef.current?.sheets?.selectedResourceIds
      )
        ? valueRef.current!.sheets!.selectedResourceIds!
        : activeIds;

      const nextSelected = currentSelected.includes(resourceId)
        ? currentSelected.filter((id) => id !== resourceId)
        : [...currentSelected, resourceId];

      onChangeRef.current({
        ...(valueRef.current || {}),
        sheets: {
          ...(valueRef.current?.sheets || {
            enabled: sheetsState.status === 'connected',
            status: sheetsState.status,
            columns: [],
            sheetName: 'Sheet1',
          }),
          selectedResourceIds: nextSelected,
        },
      });
    },
    [sheetsResources.resources, sheetsState.status]
  );

  const handleConnect = async (
    key: GoogleWorkspaceUiKey,
    appName: string
  ) => {
    const service = GOOGLE_WORKSPACE_SERVICE_MAP[key];
    if (connectingService || disconnectingService) {
      return;
    }

    setConnectingService(service);
    setOauthDiagnosticError(null);

    try {
      const { authorizationUrl } = await startGoogleWorkspaceOAuth({
        service,
        workspaceId: resolvedWorkspaceId || workspaceId,
        agentId,
      });

      // Redirect browser to Google OAuth authorization URL returned by the Edge Function
      window.location.href = authorizationUrl;
    } catch (err: any) {
      setConnectingService(null);
      const errMsg =
        err?.message ||
        `Could not start Google OAuth for ${appName}. Please try again.`;
      setOauthDiagnosticError({
        appName,
        service,
        title: `${appName} Connection Error`,
        message: errMsg,
      });
      toast.error(errMsg, { duration: 8000 });
    }
  };

  const handleRequestDisconnect = (app: (typeof apps)[number]) => {
    if (disconnectingService || connectingService) {
      return;
    }

    if (!app.connectionId) {
      const errMsg = `Cannot disconnect ${app.name}: No active integration connection ID was found in Supabase.`;
      setOauthDiagnosticError({
        appName: app.name,
        service: app.service,
        title: `${app.name} Disconnection Error`,
        message: errMsg,
      });
      toast.error(errMsg);
      return;
    }

    setOauthDiagnosticError(null);
    setDisconnectTarget({
      key: app.key,
      service: app.service,
      name: app.name,
      logo: app.logo,
      email: app.email,
      connectionId: app.connectionId,
      workspaceId: app.workspaceId || resolvedWorkspaceId || workspaceId || null,
    });
  };

  const handleConfirmDisconnect = async () => {
    if (!disconnectTarget || disconnectingService) {
      return;
    }

    const target = disconnectTarget;
    setDisconnectingService(target.service);
    setOauthDiagnosticError(null);

    try {
      const result = await disconnectGoogleWorkspaceIntegration({
        service: target.service,
        connectionId: target.connectionId,
        workspaceId: target.workspaceId || resolvedWorkspaceId || workspaceId,
        agentId,
      });

      setResolvedWorkspaceId(result.workspaceId);
      applyConnectionsToParent(result.connectionsByService);
      setDisconnectTarget(null);
      toast.success(
        result.message || `Disconnected ${target.name} successfully.`
      );
    } catch (err: any) {
      // Attempt to synchronize UI with real Supabase state without masking the error
      try {
        const refreshed = await getGoogleWorkspaceIntegrationConnections({
          workspaceId:
            target.workspaceId || resolvedWorkspaceId || workspaceId,
          agentId,
        });
        setResolvedWorkspaceId(refreshed.workspaceId);
        applyConnectionsToParent(refreshed.connectionsByService);
      } catch {
        // Keep current database-backed state intact if refresh also fails (e.g., expired session or offline)
      }

      const errMsg =
        err?.message ||
        `Could not disconnect ${target.name}. Please try again.`;
      setOauthDiagnosticError({
        appName: target.name,
        service: target.service,
        title: `${target.name} Disconnection Error`,
        message: errMsg,
      });
      setDisconnectTarget(null);
      toast.error(errMsg, { duration: 8000 });
    } finally {
      setDisconnectingService(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Main Google Workspace Hub Header Card */}
      <div className="rounded-2xl border border-border bg-card shadow-xs overflow-hidden transition-all">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsExpanded(!isExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setIsExpanded(!isExpanded);
            }
          }}
          className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer hover:bg-muted/40 transition-colors select-none"
        >
          <div className="flex items-center gap-3.5">
            {/* Google Workspace Official Logo */}
            <div className="flex size-11 items-center justify-center rounded-xl bg-white dark:bg-muted border border-border shadow-xs shrink-0 p-2">
              <GoogleWorkspaceLogo className="size-6" />
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-foreground">
                  Google Workspace
                </span>
                {connectedCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="size-3" />
                    <span>{connectedCount}/{apps.length} Connected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border">
                    {isLoadingStatus ? 'Checking status…' : `${apps.length} Tools Available`}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automate Google Sheets and Google Calendar directly within your agent workflows.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center">
            <span className="text-xs font-semibold text-primary hidden sm:inline">
              {isExpanded ? 'Hide Apps' : 'Show Apps'}
            </span>
            <div className="p-1 rounded-lg border border-border bg-background text-muted-foreground">
              {isExpanded ? (
                <ChevronUp className="size-4" />
              ) : (
                <ChevronDown className="size-4" />
              )}
            </div>
          </div>
        </div>

        {/* Expanded Apps List */}
        {isExpanded && (
          <div className="border-t border-border p-4 sm:p-6 bg-muted/20 space-y-3 animate-in fade-in duration-200">
            {isLoadingStatus && (
              <div className="rounded-xl border border-border bg-card/80 px-3.5 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
                <span>Refreshing Google Workspace connection status…</span>
              </div>
            )}

            {oauthDiagnosticError && (
              <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3.5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="size-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                      {oauthDiagnosticError.title}
                    </p>
                    <p className="text-[11px] text-red-600/90 dark:text-red-400/90 leading-relaxed break-words">
                      {oauthDiagnosticError.message}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOauthDiagnosticError(null)}
                  className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 px-0.5">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <GripVertical className="size-3.5 shrink-0 opacity-70" />
                <span>Drag apps to arrange your preferred order</span>
              </span>
              {isCustomOrder && (
                <button
                  type="button"
                  onClick={() => updateAppOrder([...DEFAULT_GOOGLE_APPS_ORDER])}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
                >
                  <RotateCcw className="size-3" />
                  <span>Reset order</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3">
              {apps.map((app) => {
                const LogoComponent = app.logo;
                const isDragged = draggedAppKey === app.key;
                const isDragOver =
                  dragOverAppKey === app.key && draggedAppKey !== app.key;
                const isThisConnecting = connectingService === app.service;
                const isThisDisconnecting = disconnectingService === app.service;
                const isBusy =
                  connectingService !== null || disconnectingService !== null;
                const resourceServiceKey: GoogleResourceServiceKey | null =
                  app.service === 'google_sheets_service'
                    ? app.service
                    : null;
                const serviceHook = resourceServiceKey
                  ? resourceHooksByService[resourceServiceKey] || null
                  : null;

                let resourceStatusBadge: {
                  label: string;
                  tone: 'emerald' | 'amber';
                } | null = null;
                if (serviceHook && app.status === 'connected') {
                  if (serviceHook.needsScopeReauth) {
                    resourceStatusBadge = {
                      label: 'Reauthorization required',
                      tone: 'amber',
                    };
                  } else if (serviceHook.activeCount > 0) {
                    resourceStatusBadge = {
                      label: `${serviceHook.activeCount} ${
                        serviceHook.activeCount === 1 ? 'Sheet' : 'Sheets'
                      } selected`,
                      tone: 'emerald',
                    };
                  }
                }

                return (
                  <div
                    key={app.key}
                    draggable
                    onDragStart={(e) => {
                      setDraggedAppKey(app.key);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', app.key);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverAppKey !== app.key) {
                        setDragOverAppKey(app.key);
                      }
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        if (dragOverAppKey === app.key) {
                          setDragOverAppKey(null);
                        }
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleDropApp(app.key);
                    }}
                    onDragEnd={() => {
                      setDraggedAppKey(null);
                      setDragOverAppKey(null);
                    }}
                    className={`rounded-xl border bg-card p-4 shadow-2xs transition-all ${
                      isDragOver
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-border/80'
                    } ${isDragged ? 'opacity-50 scale-[0.99]' : 'opacity-100'}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {/* Drag Handle */}
                        <div
                          title={`Drag to reorder ${app.name}`}
                          className="p-1 text-muted-foreground/70 hover:text-foreground cursor-grab active:cursor-grabbing rounded-md hover:bg-muted/60 transition-colors shrink-0 mt-0.5 sm:mt-0 self-center"
                        >
                          <GripVertical className="size-4" />
                        </div>

                        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-white dark:bg-muted p-2 shrink-0 mt-0.5 sm:mt-0 shadow-2xs">
                          <LogoComponent className="size-5" />
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground">
                              {app.name}
                            </span>
                            {app.status === 'disconnected' && !isLoadingStatus && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                                Not connected
                              </span>
                            )}
                            {app.status === 'connected' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="size-2.5" />
                                <span>Active</span>
                              </span>
                            )}
                            {resourceStatusBadge && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                  resourceStatusBadge.tone === 'emerald'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                }`}
                              >
                                {resourceStatusBadge.label}
                              </span>
                            )}
                            {app.status === 'expired' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <AlertCircle className="size-2.5" />
                                <span>
                                  {resourceServiceKey
                                    ? 'Authorization expired'
                                    : 'Expired'}
                                </span>
                              </span>
                            )}
                            {app.status === 'error' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                                <AlertCircle className="size-2.5" />
                                <span>Error</span>
                              </span>
                            )}
                            {app.status !== 'disconnected' && app.email && (
                              <span
                                title={`Connected Google account for ${app.name}: ${app.email}`}
                                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground/85 border border-border max-w-[220px] truncate"
                              >
                                {app.email}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {app.description}
                          </p>
                          {app.status === 'error' && app.lastError && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">
                              {app.lastError}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center shrink-0 pt-1 sm:pt-0">
                        {app.status === 'connected' ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <CheckCircle2 className="size-3.5" />
                              <span>Connected</span>
                            </span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleRequestDisconnect(app)}
                              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 px-2 py-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isThisDisconnecting ? (
                                <>
                                  <Loader2 className="size-3 animate-spin" />
                                  <span>Disconnecting…</span>
                                </>
                              ) : (
                                <span>Disconnect</span>
                              )}
                            </button>
                          </div>
                        ) : app.status === 'expired' || app.status === 'error' ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border ${
                                app.status === 'expired'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                              }`}
                            >
                              <AlertCircle className="size-3.5" />
                              <span>
                                {app.status === 'expired'
                                  ? resourceServiceKey
                                    ? 'Authorization expired'
                                    : 'Expired'
                                  : 'Error'}
                              </span>
                            </span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleConnect(app.key, app.name)}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {isThisConnecting ? (
                                <>
                                  <Loader2 className="size-3.5 animate-spin" />
                                  <span>Connecting…</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="size-3.5" />
                                  <span>Reconnect to {app.name}</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleConnect(app.key, app.name)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isThisConnecting ? (
                              <>
                                <Loader2 className="size-3.5 animate-spin" />
                                <span>Connecting to {app.name}…</span>
                              </>
                            ) : (
                              <>
                                <LogoComponent className="size-3.5" />
                                <span>Connect to {app.name}</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Independent Authorized Resources Section for Google Sheets */}
                    {resourceServiceKey && serviceHook && (
                      <AuthorizedResourcesSection
                        service={resourceServiceKey}
                        status={app.status}
                        resources={serviceHook.resources}
                        selectedCount={serviceHook.selectedCount}
                        activeCount={serviceHook.activeCount}
                        needsScopeReauth={serviceHook.needsScopeReauth}
                        scopeReauthMessage={serviceHook.scopeReauthMessage}
                        isLoadingResources={serviceHook.isLoadingResources}
                        isFetchingPickerToken={serviceHook.isFetchingPickerToken}
                        isPickerOpen={serviceHook.isPickerOpen}
                        isSavingSelection={serviceHook.isSavingSelection}
                        removingResourceId={serviceHook.removingResourceId}
                        resourcesError={serviceHook.resourcesError}
                        isBusyConnectingOrDisconnecting={isBusy}
                        selectedAgentResourceIds={
                          onChange
                            ? value?.sheets?.selectedResourceIds
                            : undefined
                        }
                        onToggleAgentResource={
                          onChange
                            ? (resId) =>
                                handleToggleAgentResource(
                                  resourceServiceKey,
                                  resId
                                )
                            : undefined
                        }
                        onSelectResources={() => {
                          void serviceHook.selectResources().then((picked) => {
                            if (
                              resourceServiceKey === 'google_sheets_service' &&
                              Array.isArray(picked) &&
                              picked.length > 0
                            ) {
                              setSheetsTabRefreshByResource((prev) => {
                                const next = { ...prev };
                                for (const res of picked) {
                                  next[res.id] = (next[res.id] || 0) + 1;
                                }
                                return next;
                              });
                            }
                          });
                        }}
                        onRequestRemoveResource={(res) =>
                          setResourceToRemove({
                            service: resourceServiceKey,
                            resource: res,
                          })
                        }
                        onRefreshResources={() => {
                          void serviceHook.refreshResources();
                          if (resourceServiceKey === 'google_sheets_service') {
                            setSheetsTabRefreshTrigger((prev) => prev + 1);
                          }
                        }}
                        onConnectService={() =>
                          void handleConnect(app.key, app.name)
                        }
                        onClearError={serviceHook.clearResourcesError}
                        renderResourceExtra={
                          resourceServiceKey === 'google_sheets_service'
                            ? (resource) => (
                                <GoogleSheetTabsSelector
                                  workspaceId={sheetsState.workspaceId}
                                  agentId={agentId}
                                  connectionId={sheetsState.connectionId}
                                  resource={resource}
                                  refreshTrigger={
                                    sheetsTabRefreshTrigger +
                                    (sheetsTabRefreshByResource[resource.id] || 0)
                                  }
                                  isBusyConnectingOrDisconnecting={isBusy}
                                  onReconnectSheets={() =>
                                    void handleConnect('sheets', 'Google Sheets')
                                  }
                                />
                              )
                            : undefined
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <RemoveGoogleResourceModal
        resource={resourceToRemove?.resource || null}
        service={resourceToRemove?.service}
        isRemoving={Boolean(
          resourceToRemove &&
            resourceHooksByService[resourceToRemove.service]
              ?.removingResourceId === resourceToRemove.resource.id
        )}
        onCancel={() => {
          const activeHook = resourceToRemove
            ? resourceHooksByService[resourceToRemove.service]
            : null;
          if (!activeHook?.removingResourceId) {
            setResourceToRemove(null);
          }
        }}
        onConfirm={() => void handleConfirmRemoveResource()}
      />

      {/* Disconnect Confirmation Dialog */}
      {disconnectTarget && (
        <div
          id="disconnect-google-integration-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            if (!disconnectingService) {
              setDisconnectTarget(null);
            }
          }}
        >
          <div
            id="disconnect-google-integration-modal"
            className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="disconnect-google-title"
            aria-describedby="disconnect-google-desc"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-white dark:bg-muted p-2 shrink-0 shadow-2xs">
                  <disconnectTarget.logo className="size-6" />
                </div>
                <div>
                  <h3
                    id="disconnect-google-title"
                    className="text-base font-semibold text-foreground"
                  >
                    Disconnect {disconnectTarget.name}?
                  </h3>
                  {disconnectTarget.email && (
                    <p className="text-xs text-muted-foreground">
                      {disconnectTarget.email}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                disabled={Boolean(disconnectingService)}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p
                id="disconnect-google-desc"
                className="text-xs sm:text-sm text-muted-foreground leading-relaxed"
              >
                Once disconnected,{' '}
                <span className="font-semibold text-foreground">
                  {disconnectTarget.name}
                </span>{' '}
                will no longer be available to Zivofly in this workspace, and its stored access credentials will be removed.
              </p>

              <div className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground leading-relaxed">
                Other connected Google Workspace integrations will remain active and unaffected. You can reconnect {disconnectTarget.name} at any time.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                disabled={Boolean(disconnectingService)}
                className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-accent/70 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDisconnect}
                disabled={Boolean(disconnectingService)}
                className="rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {disconnectingService === disconnectTarget.service ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Disconnecting…</span>
                  </>
                ) : (
                  <>
                    <Unplug className="size-3.5" />
                    <span>Disconnect {disconnectTarget.name}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

