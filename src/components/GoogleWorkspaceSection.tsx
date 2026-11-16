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
  Plus,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  GoogleAuthorizedResource,
  GoogleWorkspaceConfig,
  GoogleWorkspaceIntegrationStatus,
  GoogleWorkspaceServiceIdentifier,
} from '../types';
import {
  GoogleWorkspaceLogo,
  GmailLogo,
  GoogleDriveLogo,
  GoogleDocsLogo,
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
import { useGoogleSelectedResources } from '../hooks/useGoogleSelectedResources';
import {
  AuthorizedResourcesSection,
  RemoveGoogleResourceModal,
  formatSelectionDate,
  renderResourceMimeIcon,
} from './AuthorizedResourcesSection';

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
  const [resourceToRemove, setResourceToRemove] =
    useState<GoogleAuthorizedResource | null>(null);
  const [oauthDiagnosticError, setOauthDiagnosticError] = useState<{
    appName: string;
    service: GoogleWorkspaceServiceIdentifier;
    title: string;
    message: string;
  } | null>(null);

  const valueRef = useRef<GoogleWorkspaceConfig | undefined>(value);
  valueRef.current = value;
  const onChangeRef = useRef<typeof onChange>(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setResolvedWorkspaceId(workspaceId || null);
  }, [workspaceId]);

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

  // Sync agent-level selected resource IDs whenever active authorized resources change
  const handleResourcesUpdated = useCallback((activeResourceIds: string[]) => {
    const currentDrive = valueRef.current?.drive;
    if (!onChangeRef.current || !currentDrive) return;

    const existingSelected = currentDrive.selectedResourceIds;
    if (!Array.isArray(existingSelected)) return;

    const activeSet = new Set(activeResourceIds);
    const pruned = existingSelected.filter((id) => activeSet.has(id));
    if (pruned.length !== existingSelected.length) {
      onChangeRef.current({
        ...(valueRef.current || {}),
        drive: {
          ...currentDrive,
          selectedResourceIds: pruned,
        },
      });
    }
  }, []);

  const driveRecord = connectionsByService.google_drive;
  const driveStatus: GoogleWorkspaceIntegrationStatus =
    !driveRecord || driveRecord.status === 'disconnected'
      ? 'disconnected'
      : driveRecord.status;
  const driveConnectionId =
    driveStatus !== 'disconnected' ? driveRecord?.id || null : null;
  const effectiveDriveWorkspaceId =
    driveRecord?.workspace_id || resolvedWorkspaceId || workspaceId || null;

  const googleResources = useGoogleSelectedResources({
    workspaceId: effectiveDriveWorkspaceId,
    connectionId: driveConnectionId,
    status: driveStatus,
    driveAccountEmail: driveRecord?.account_email || null,
    agentId,
    onResourcesUpdated: handleResourcesUpdated,
  });

  const handleConfirmRemoveResource = useCallback(async () => {
    if (!resourceToRemove || googleResources.removingResourceId) return;
    const removed = await googleResources.removeResource(resourceToRemove);
    if (removed) {
      setResourceToRemove(null);
    }
  }, [resourceToRemove, googleResources]);

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
              service: callbackRes.service || 'gmail',
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

  const apps: Array<{
    key: GoogleWorkspaceUiKey;
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
  }> = [
    {
      key: 'gmail',
      name: 'Gmail',
      logo: GmailLogo,
      description:
        'Send automated booking confirmations, draft replies to client inquiries, and read inbound requests.',
      ...getAppRecordState('gmail'),
      isConnected: getAppRecordState('gmail').status === 'connected',
    },
    {
      key: 'drive',
      name: 'Google Drive',
      logo: GoogleDriveLogo,
      description:
        'Store shared client assets, access product catalogs and media folders, and archive generated receipts.',
      ...getAppRecordState('drive'),
      isConnected: getAppRecordState('drive').status === 'connected',
    },
    {
      key: 'docs',
      name: 'Google Docs',
      logo: GoogleDocsLogo,
      description:
        'Read standard operating procedures, extract policy guidelines, and generate formatted agreements.',
      ...getAppRecordState('docs'),
      isConnected: getAppRecordState('docs').status === 'connected',
    },
    {
      key: 'sheets',
      name: 'Google Sheets',
      logo: GoogleSheetsLogo,
      description:
        'Sync live product catalogues, pricing lists, or capture leads directly into your Google spreadsheets.',
      ...getAppRecordState('sheets'),
      isConnected: getAppRecordState('sheets').status === 'connected',
    },
    {
      key: 'calendar',
      name: 'Google Calendar',
      logo: GoogleCalendarLogo,
      description:
        'Check real-time slot availability, schedule customer bookings, and dispatch Google Meet invites.',
      ...getAppRecordState('calendar'),
      isConnected: getAppRecordState('calendar').status === 'connected',
    },
  ];

  const connectedCount = apps.filter((app) => app.isConnected).length;

  const authorizedDocs = googleResources.resources.filter(
    (r) => r.mime_type?.toLowerCase() === 'application/vnd.google-apps.document'
  );
  const authorizedSheets = googleResources.resources.filter(
    (r) => r.mime_type?.toLowerCase() === 'application/vnd.google-apps.spreadsheet'
  );
  const authorizedDocsCount = authorizedDocs.length;
  const authorizedSheetsCount = authorizedSheets.length;

  const handleToggleAgentResource = useCallback(
    (resourceId: string) => {
      if (!onChangeRef.current) return;
      const activeIds = googleResources.resources.map((r) => r.id);
      const currentSelected = Array.isArray(valueRef.current?.drive?.selectedResourceIds)
        ? valueRef.current!.drive!.selectedResourceIds!
        : activeIds;

      const nextSelected = currentSelected.includes(resourceId)
        ? currentSelected.filter((id) => id !== resourceId)
        : [...currentSelected, resourceId];

      onChangeRef.current({
        ...(valueRef.current || {}),
        drive: {
          ...(valueRef.current?.drive || {
            enabled: driveStatus === 'connected',
            status: driveStatus,
          }),
          selectedResourceIds: nextSelected,
        },
      });
    },
    [googleResources.resources, driveStatus]
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
                    <span>{connectedCount}/5 Connected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border">
                    {isLoadingStatus ? 'Checking status…' : '5 Tools Available'}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automate Gmail, Google Drive, Google Docs, Google Sheets, and Google Calendar directly within your agent workflows.
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
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Select & Connect Google Workspace Tools
            </div>

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

            <div className="grid grid-cols-1 gap-3">
              {apps.map((app) => {
                const LogoComponent = app.logo;
                const isThisConnecting = connectingService === app.service;
                const isThisDisconnecting = disconnectingService === app.service;
                const isBusy =
                  connectingService !== null || disconnectingService !== null;
                const isDriveCard = app.key === 'drive';
                const driveResourceBadge =
                  isDriveCard && app.status === 'connected'
                    ? googleResources.activeCount > 0
                      ? 'Resources selected'
                      : 'Selection required'
                    : null;

                return (
                  <div
                    key={app.key}
                    className="rounded-xl border border-border bg-card p-4 shadow-2xs hover:border-border/80 transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-white dark:bg-muted p-2 shrink-0 mt-0.5 sm:mt-0 shadow-2xs">
                          <LogoComponent className="size-5" />
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground">
                              {app.name}
                            </span>
                            {app.status === 'connected' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="size-2.5" />
                                <span>Active</span>
                              </span>
                            )}
                            {driveResourceBadge && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                  driveResourceBadge === 'Resources selected'
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                }`}
                              >
                                {driveResourceBadge}
                              </span>
                            )}
                            {app.key === 'docs' && app.status === 'connected' && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                  driveStatus !== 'connected'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                    : authorizedDocsCount > 0
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                }`}
                              >
                                {driveStatus !== 'connected'
                                  ? 'Select via Google Drive'
                                  : authorizedDocsCount > 0
                                  ? `${authorizedDocsCount} ${
                                      authorizedDocsCount === 1 ? 'Doc' : 'Docs'
                                    } selected`
                                  : 'Selection required'}
                              </span>
                            )}
                            {app.key === 'sheets' && app.status === 'connected' && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                                  driveStatus !== 'connected'
                                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                    : authorizedSheetsCount > 0
                                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                    : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                }`}
                              >
                                {driveStatus !== 'connected'
                                  ? 'Select via Google Drive'
                                  : authorizedSheetsCount > 0
                                  ? `${authorizedSheetsCount} ${
                                      authorizedSheetsCount === 1 ? 'Sheet' : 'Sheets'
                                    } selected`
                                  : 'Selection required'}
                              </span>
                            )}
                            {app.status === 'expired' && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <AlertCircle className="size-2.5" />
                                <span>
                                  {isDriveCard ? 'Authorization expired' : 'Expired'}
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
                              <span className="text-[11px] font-medium text-muted-foreground">
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
                                  ? isDriveCard
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

                    {/* Google Drive Authorized Resources Section */}
                    {isDriveCard && (
                      <AuthorizedResourcesSection
                        driveStatus={app.status}
                        resources={googleResources.resources}
                        selectedCount={googleResources.selectedCount}
                        activeCount={googleResources.activeCount}
                        isLoadingResources={googleResources.isLoadingResources}
                        isFetchingPickerToken={googleResources.isFetchingPickerToken}
                        isPickerOpen={googleResources.isPickerOpen}
                        isSavingSelection={googleResources.isSavingSelection}
                        removingResourceId={googleResources.removingResourceId}
                        resourcesError={googleResources.resourcesError}
                        isBusyConnectingOrDisconnecting={isBusy}
                        selectedAgentResourceIds={
                          onChange ? value?.drive?.selectedResourceIds : undefined
                        }
                        onToggleAgentResource={
                          onChange ? handleToggleAgentResource : undefined
                        }
                        onSelectResources={() =>
                          void googleResources.selectResources('all')
                        }
                        onRequestRemoveResource={(res) => setResourceToRemove(res)}
                        onRefreshResources={() =>
                          void googleResources.refreshResources()
                        }
                        onConnectDrive={() =>
                          void handleConnect('drive', 'Google Drive')
                        }
                        onClearError={googleResources.clearResourcesError}
                      />
                    )}

                    {/* Google Docs & Google Sheets Resource Selection Interface (via central Google Drive connection) */}
                    {(app.key === 'docs' || app.key === 'sheets') &&
                      app.status === 'connected' && (
                        <div className="mt-3 pt-3 border-t border-border/80 space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="space-y-0.5">
                              <span className="text-xs font-semibold text-foreground">
                                {app.key === 'docs'
                                  ? 'Authorized Google Docs'
                                  : 'Authorized Google Sheets'}
                              </span>
                              <p className="text-[11px] text-muted-foreground">
                                {app.key === 'docs'
                                  ? 'Google Docs files are selected and authorized centrally through Google Drive.'
                                  : 'Google Sheets spreadsheets are selected and authorized centrally through Google Drive.'}
                              </p>
                            </div>

                            {driveStatus === 'connected' ? (
                              <button
                                type="button"
                                disabled={
                                  isBusy ||
                                  googleResources.isFetchingPickerToken ||
                                  googleResources.isPickerOpen ||
                                  googleResources.isSavingSelection ||
                                  Boolean(googleResources.removingResourceId)
                                }
                                onClick={() =>
                                  void googleResources.selectResources(
                                    app.key === 'docs'
                                      ? 'documents'
                                      : 'spreadsheets'
                                  )
                                }
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {googleResources.isFetchingPickerToken ||
                                googleResources.isPickerOpen ||
                                googleResources.isSavingSelection ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <Plus className="size-3.5" />
                                )}
                                <span>
                                  {app.key === 'docs'
                                    ? authorizedDocsCount > 0
                                      ? 'Manage Docs via Drive'
                                      : 'Select Docs via Drive'
                                    : authorizedSheetsCount > 0
                                    ? 'Manage Sheets via Drive'
                                    : 'Select Sheets via Drive'}
                                </span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  void handleConnect('drive', 'Google Drive')
                                }
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw className="size-3.5" />
                                <span>
                                  {driveStatus === 'expired' || driveStatus === 'error'
                                    ? 'Reconnect Google Drive'
                                    : 'Connect Google Drive'}
                                </span>
                              </button>
                            )}
                          </div>

                          {driveStatus === 'connected' &&
                            (app.key === 'docs' ? authorizedDocs : authorizedSheets)
                              .length > 0 && (
                              <div className="divide-y divide-border rounded-xl border border-border bg-background/60 overflow-hidden">
                                {(app.key === 'docs'
                                  ? authorizedDocs
                                  : authorizedSheets
                                ).map((resource) => (
                                  <div
                                    key={resource.id}
                                    className="px-3 py-2 flex items-center justify-between gap-2.5 hover:bg-muted/30 transition-colors"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {renderResourceMimeIcon(resource.mime_type)}
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium text-foreground truncate max-w-[240px] sm:max-w-[340px]">
                                          {resource.name}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                          Selected{' '}
                                          {formatSelectionDate(
                                            resource.selected_at ||
                                              resource.created_at
                                          )}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {resource.web_view_link && (
                                        <a
                                          href={resource.web_view_link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
                                        >
                                          <span>Open</span>
                                          <ExternalLink className="size-3" />
                                        </a>
                                      )}
                                      <button
                                        type="button"
                                        disabled={Boolean(
                                          googleResources.removingResourceId
                                        )}
                                        onClick={() => setResourceToRemove(resource)}
                                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50"
                                      >
                                        <Trash2 className="size-3" />
                                        <span>Remove</span>
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <RemoveGoogleResourceModal
        resource={resourceToRemove}
        isRemoving={Boolean(
          resourceToRemove &&
            googleResources.removingResourceId === resourceToRemove.id
        )}
        onCancel={() => {
          if (!googleResources.removingResourceId) {
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
                    <span>Disconnect</span>
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

