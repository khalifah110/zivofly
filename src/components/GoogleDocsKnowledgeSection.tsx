import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Unplug,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  GoogleAuthorizedResource,
  GoogleWorkspaceConfig,
  GoogleWorkspaceIntegrationStatus,
  GoogleWorkspaceServiceIdentifier,
} from '../types';
import { GoogleDocsLogo } from './BrandLogos';
import {
  createEmptyGoogleConnectionsMap,
  disconnectGoogleWorkspaceIntegration,
  getGoogleWorkspaceIntegrationConnections,
  GoogleIntegrationConnectionRecord,
  processGoogleWorkspaceOAuthCallbackFromUrl,
  startGoogleWorkspaceOAuth,
  syncGoogleWorkspaceConfigWithRecords,
} from '../lib/supabaseService';
import { useGoogleSelectedResources } from '../hooks/useGoogleSelectedResources';
import {
  AuthorizedResourcesSection,
  RemoveGoogleResourceModal,
} from './AuthorizedResourcesSection';

interface GoogleDocsKnowledgeSectionProps {
  value?: GoogleWorkspaceConfig;
  onChange?: (config: GoogleWorkspaceConfig) => void;
  workspaceId?: string | null;
  agentId?: string | null;
}

export const GoogleDocsKnowledgeSection: React.FC<GoogleDocsKnowledgeSectionProps> = ({
  value,
  onChange,
  workspaceId,
  agentId,
}) => {
  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string | null>(
    workspaceId || null
  );
  const [docsRecord, setDocsRecord] =
    useState<GoogleIntegrationConnectionRecord | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);
  const [resourceToRemove, setResourceToRemove] =
    useState<GoogleAuthorizedResource | null>(null);
  const [oauthDiagnosticError, setOauthDiagnosticError] = useState<{
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
      setDocsRecord(nextMap.google_docs || null);
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

  const status: GoogleWorkspaceIntegrationStatus =
    !docsRecord || docsRecord.status === 'disconnected'
      ? 'disconnected'
      : docsRecord.status;
  const connectionId = status !== 'disconnected' ? docsRecord?.id || null : null;
  const effectiveWorkspaceId =
    docsRecord?.workspace_id || resolvedWorkspaceId || workspaceId || null;
  const accountEmail =
    status !== 'disconnected' ? docsRecord?.account_email || undefined : undefined;
  const lastError =
    status !== 'disconnected' ? docsRecord?.last_error || null : null;

  const handleDocsResourcesUpdated = useCallback(
    (activeResourceIds: string[]) => {
      if (!onChangeRef.current) return;
      const activeSet = new Set(activeResourceIds);
      const currentDocs = valueRef.current?.docs;
      if (!currentDocs || !Array.isArray(currentDocs.selectedResourceIds)) {
        return;
      }
      const pruned = currentDocs.selectedResourceIds.filter((id) =>
        activeSet.has(id)
      );
      if (pruned.length !== currentDocs.selectedResourceIds.length) {
        onChangeRef.current({
          ...(valueRef.current || {}),
          docs: {
            ...currentDocs,
            selectedResourceIds: pruned,
          },
        });
      }
    },
    []
  );

  const docsResources = useGoogleSelectedResources({
    service: 'google_docs',
    workspaceId: effectiveWorkspaceId,
    connectionId,
    status,
    accountEmail: accountEmail || null,
    connectionScopes: docsRecord?.scopes,
    agentId,
    onResourcesUpdated: handleDocsResourcesUpdated,
  });

  useEffect(() => {
    if (!showDisconnectModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDisconnecting) {
        setShowDisconnectModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showDisconnectModal, isDisconnecting]);

  useEffect(() => {
    let cancelled = false;

    const initializeDocsIntegration = async () => {
      setIsLoadingStatus(true);
      try {
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
                `Connected ${callbackRes.serviceLabel || 'Google Docs'} successfully!`
            );
          } else if (callbackRes.outcome === 'error') {
            const errMessage =
              callbackRes.message ||
              'Google Docs authorization could not be completed.';
            setOauthDiagnosticError({
              title: `${callbackRes.serviceLabel || 'Google Docs'} Connection Error`,
              message: errMessage,
            });
            toast.error(errMessage, { duration: 8000 });
          }
          if (callbackRes.connectionsByService) {
            return;
          }
        }

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
      } catch {
        if (!cancelled) {
          setDocsRecord(createEmptyGoogleConnectionsMap().google_docs);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStatus(false);
        }
      }
    };

    void initializeDocsIntegration();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, agentId, applyConnectionsToParent]);

  const handleToggleAgentDocResource = useCallback(
    (resourceId: string) => {
      if (!onChangeRef.current) return;
      const activeIds = docsResources.resources.map((r) => r.id);
      const currentSelected = Array.isArray(
        valueRef.current?.docs?.selectedResourceIds
      )
        ? valueRef.current!.docs!.selectedResourceIds!
        : activeIds;

      const nextSelected = currentSelected.includes(resourceId)
        ? currentSelected.filter((id) => id !== resourceId)
        : [...currentSelected, resourceId];

      onChangeRef.current({
        ...(valueRef.current || {}),
        docs: {
          ...(valueRef.current?.docs || {
            enabled: status === 'connected',
            status,
          }),
          selectedResourceIds: nextSelected,
        },
      });
    },
    [docsResources.resources, status]
  );

  const handleConnectDocs = async () => {
    if (isConnecting || isDisconnecting) return;

    setIsConnecting(true);
    setOauthDiagnosticError(null);

    try {
      const { authorizationUrl } = await startGoogleWorkspaceOAuth({
        service: 'google_docs',
        workspaceId: resolvedWorkspaceId || workspaceId,
        agentId,
        returnTab: 'knowledge',
      });

      window.location.href = authorizationUrl;
    } catch (err: any) {
      setIsConnecting(false);
      const errMsg =
        err?.message ||
        'Could not start Google OAuth for Google Docs. Please try again.';
      setOauthDiagnosticError({
        title: 'Google Docs Connection Error',
        message: errMsg,
      });
      toast.error(errMsg, { duration: 8000 });
    }
  };

  const handleRequestDisconnect = () => {
    if (isDisconnecting || isConnecting) return;

    if (!connectionId) {
      const errMsg =
        'Cannot disconnect Google Docs: No active integration connection ID was found in Supabase.';
      setOauthDiagnosticError({
        title: 'Google Docs Disconnection Error',
        message: errMsg,
      });
      toast.error(errMsg);
      return;
    }

    setOauthDiagnosticError(null);
    setShowDisconnectModal(true);
  };

  const handleConfirmDisconnect = async () => {
    if (!connectionId || isDisconnecting) return;

    setIsDisconnecting(true);
    setOauthDiagnosticError(null);

    try {
      const result = await disconnectGoogleWorkspaceIntegration({
        service: 'google_docs',
        connectionId,
        workspaceId: effectiveWorkspaceId || resolvedWorkspaceId || workspaceId,
        agentId,
      });

      setResolvedWorkspaceId(result.workspaceId);
      applyConnectionsToParent(result.connectionsByService);
      setShowDisconnectModal(false);
      toast.success(result.message || 'Disconnected Google Docs successfully.');
    } catch (err: any) {
      try {
        const refreshed = await getGoogleWorkspaceIntegrationConnections({
          workspaceId: effectiveWorkspaceId || resolvedWorkspaceId || workspaceId,
          agentId,
        });
        setResolvedWorkspaceId(refreshed.workspaceId);
        applyConnectionsToParent(refreshed.connectionsByService);
      } catch {
        // Keep current database-backed state intact
      }

      const errMsg =
        err?.message || 'Could not disconnect Google Docs. Please try again.';
      setOauthDiagnosticError({
        title: 'Google Docs Disconnection Error',
        message: errMsg,
      });
      setShowDisconnectModal(false);
      toast.error(errMsg, { duration: 8000 });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleConfirmRemoveResource = useCallback(async () => {
    if (!resourceToRemove || docsResources.removingResourceId) return;
    const removed = await docsResources.removeResource(resourceToRemove);
    if (removed) {
      setResourceToRemove(null);
    }
  }, [resourceToRemove, docsResources]);

  const isBusy = isConnecting || isDisconnecting;

  return (
    <div className="space-y-4">
      {isLoadingStatus && (
        <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
          <span>Checking Google Docs connection status…</span>
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

      {/* Disconnected / Expired / Error State: Mirrors "Upload from Device" dashed card with green Connect CTA */}
      {status !== 'connected' ? (
        <div className="rounded-2xl border-2 border-dashed border-border/80 hover:border-primary/50 bg-muted/20 p-8 text-center transition-all">
          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-white dark:bg-muted border border-border shadow-2xs">
              <GoogleDocsLogo className="size-7" />
            </div>

            <div className="space-y-1 max-w-md">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-foreground">
                  {status === 'expired'
                    ? 'Reconnect Google Docs'
                    : status === 'error'
                    ? 'Google Docs connection needs attention'
                    : 'Choose documents from Google Docs'}
                </p>
                {status === 'expired' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    <AlertCircle className="size-2.5" />
                    <span>Expired</span>
                  </span>
                )}
                {status === 'error' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                    <AlertCircle className="size-2.5" />
                    <span>Error</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {status === 'expired' || status === 'error'
                  ? lastError ||
                    'Reconnect your Google Docs account with read-only permissions to select and manage documents via Google Picker.'
                  : 'Connect your Google Docs account with read-only permissions to select specific native Google Docs via Google Picker.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
              <span className="px-2 py-0.5 rounded-md bg-muted font-medium border border-border">
                Google Docs
              </span>
              <span className="px-2 py-0.5 rounded-md bg-muted font-medium border border-border font-mono text-[10px]">
                drive.file
              </span>
              <span className="px-2 py-0.5 rounded-md bg-muted font-medium border border-border font-mono text-[10px]">
                documents.readonly
              </span>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleConnectDocs()}
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white px-4 py-2 text-xs font-semibold shadow-xs hover:shadow-sm transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Connecting to Google…</span>
                </>
              ) : status === 'expired' || status === 'error' ? (
                <>
                  <RefreshCw className="size-3.5" />
                  <span>Reconnect to Google</span>
                </>
              ) : (
                <>
                  <GoogleDocsLogo className="size-3.5" />
                  <span>Connect to Google</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Connected State: Connection summary + Google Picker & Selected Docs management */
        <div className="rounded-2xl border border-border bg-muted/20 p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-white dark:bg-muted p-2 shrink-0 shadow-2xs">
                <GoogleDocsLogo className="size-5" />
              </div>

              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">
                    Google Docs
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="size-2.5" />
                    <span>Read-only connected</span>
                  </span>
                  {docsResources.needsScopeReauth && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      Reauthorization required
                    </span>
                  )}
                  {!docsResources.needsScopeReauth && docsResources.activeCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                      <Clock className="size-2.5" />
                      <span>
                        {docsResources.activeCount}{' '}
                        {docsResources.activeCount === 1 ? 'Doc' : 'Docs'} selected · Indexing pending
                      </span>
                    </span>
                  )}
                  {accountEmail && (
                    <span
                      title={`Connected Google account for Google Docs: ${accountEmail}`}
                      className="inline-flex items-center rounded-full bg-background px-2 py-0.5 text-[10px] font-medium text-foreground/85 border border-border max-w-[220px] truncate"
                    >
                      {accountEmail}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Select native Google Docs via Google Picker using read-only permissions (<span className="font-mono">drive.file</span> + <span className="font-mono">documents.readonly</span>).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="size-3.5" />
                <span>Connected</span>
              </span>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleRequestDisconnect}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-500 px-2 py-1 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    <span>Disconnecting…</span>
                  </>
                ) : (
                  <span>Disconnect</span>
                )}
              </button>
            </div>
          </div>

          <AuthorizedResourcesSection
            service="google_docs"
            status={status}
            resources={docsResources.resources}
            selectedCount={docsResources.selectedCount}
            activeCount={docsResources.activeCount}
            needsScopeReauth={docsResources.needsScopeReauth}
            scopeReauthMessage={docsResources.scopeReauthMessage}
            isLoadingResources={docsResources.isLoadingResources}
            isFetchingPickerToken={docsResources.isFetchingPickerToken}
            isPickerOpen={docsResources.isPickerOpen}
            isSavingSelection={docsResources.isSavingSelection}
            removingResourceId={docsResources.removingResourceId}
            resourcesError={docsResources.resourcesError}
            isBusyConnectingOrDisconnecting={isBusy}
            pendingSyncBadgeLabel="Indexing pending"
            selectedAgentResourceIds={
              onChange ? value?.docs?.selectedResourceIds : undefined
            }
            onToggleAgentResource={
              onChange ? handleToggleAgentDocResource : undefined
            }
            onSelectResources={() => void docsResources.selectResources()}
            onRequestRemoveResource={(res) => setResourceToRemove(res)}
            onRefreshResources={() => void docsResources.refreshResources()}
            onConnectService={() => void handleConnectDocs()}
            onClearError={docsResources.clearResourcesError}
          />
        </div>
      )}

      {/* Honest Backend Ingestion & Sync Limitation Notice */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-2.5">
        <Clock className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Knowledge Base indexing &amp; sync pending backend support
          </p>
          <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
            You can connect Google Docs and save your document selections via Google Picker, and existing selections are preserved. However, server-side Google Docs text extraction, Knowledge Base indexing, and automatic change synchronization are not yet deployed in Supabase—selected Google Docs are currently <strong>pending indexing</strong> and are not yet searchable by your agent. To ground your agent immediately, switch to <strong>Upload from Device</strong> or <strong>Enter Manually</strong>.
          </p>
        </div>
      </div>

      <RemoveGoogleResourceModal
        resource={resourceToRemove}
        service="google_docs"
        isRemoving={Boolean(
          resourceToRemove &&
            docsResources.removingResourceId === resourceToRemove.id
        )}
        onCancel={() => {
          if (!docsResources.removingResourceId) {
            setResourceToRemove(null);
          }
        }}
        onConfirm={() => void handleConfirmRemoveResource()}
      />

      {/* Disconnect Google Docs Confirmation Dialog (isolated to google_docs only) */}
      {showDisconnectModal && (
        <div
          id="disconnect-google-docs-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => {
            if (!isDisconnecting) {
              setShowDisconnectModal(false);
            }
          }}
        >
          <div
            id="disconnect-google-docs-modal"
            className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="disconnect-google-docs-title"
            aria-describedby="disconnect-google-docs-desc"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-white dark:bg-muted p-2 shrink-0 shadow-2xs">
                  <GoogleDocsLogo className="size-6" />
                </div>
                <div>
                  <h3
                    id="disconnect-google-docs-title"
                    className="text-base font-semibold text-foreground"
                  >
                    Disconnect Google Docs?
                  </h3>
                  {accountEmail && (
                    <p className="text-xs text-muted-foreground">
                      {accountEmail}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnecting}
                className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors disabled:opacity-40 cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p
                id="disconnect-google-docs-desc"
                className="text-xs sm:text-sm text-muted-foreground leading-relaxed"
              >
                Once disconnected,{' '}
                <span className="font-semibold text-foreground">
                  Google Docs
                </span>{' '}
                will no longer be connected to Zivofly in this workspace, and its stored access credentials will be removed.
              </p>

              <div className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground leading-relaxed">
                Other connected Google Workspace integrations (such as Google Sheets and Google Calendar) will remain active and unaffected. You can reconnect Google Docs at any time.
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowDisconnectModal(false)}
                disabled={isDisconnecting}
                className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-accent/70 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDisconnect()}
                disabled={isDisconnecting}
                className="rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Disconnecting…</span>
                  </>
                ) : (
                  <>
                    <Unplug className="size-3.5" />
                    <span>Disconnect Google Docs</span>
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
