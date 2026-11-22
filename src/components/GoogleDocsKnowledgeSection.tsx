import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  KeyRound,
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
  KnowledgeDocument,
  KnowledgeDocumentStatus,
} from '../types';
import { GoogleDocsLogo } from './BrandLogos';
import {
  classifyKnowledgeProcessingError,
  createEmptyGoogleConnectionsMap,
  disconnectGoogleWorkspaceIntegration,
  getGoogleWorkspaceIntegrationConnections,
  getWorkspaceGoogleDocKnowledgeRecords,
  GoogleIntegrationConnectionRecord,
  isValidUuid,
  processGoogleWorkspaceOAuthCallbackFromUrl,
  startGoogleWorkspaceOAuth,
  syncGoogleDocToKnowledgeBase,
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
  agentName?: string | null;
  docsRefreshKey?: number;
  onKnowledgeDocSynced?: (doc: KnowledgeDocument, targetAgentId: string) => void;
}

interface RuntimeSyncEntry {
  resourceId: string;
  agentId: string;
  status: KnowledgeDocumentStatus | null;
  chunkCount: number | null;
  sourceModifiedTime: string | null;
  error: string | null;
  stage: string | null;
  documentId: string | null;
  reconnectRequired: boolean;
}

function formatDateTimeLabel(dateIso?: string | null): string | null {
  if (!dateIso) return null;
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function matchesGoogleResource(
  doc: KnowledgeDocument,
  resource: GoogleAuthorizedResource
): boolean {
  const meta = doc.metadata || {};
  const candidateResourceIds = [
    meta.resource_id,
    meta.google_resource_id,
    meta.selected_resource_id,
    meta.google_selected_resource_id,
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  if (candidateResourceIds.includes(resource.id)) {
    return true;
  }

  const candidateFileIds = [
    meta.google_file_id,
    meta.file_id,
    meta.document_id,
    meta.source_document_id,
    meta.external_id,
  ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);

  if (
    resource.google_file_id &&
    candidateFileIds.includes(resource.google_file_id)
  ) {
    return true;
  }

  if (
    doc.sourceUrl &&
    resource.google_file_id &&
    doc.sourceUrl.includes(resource.google_file_id)
  ) {
    return true;
  }

  if (
    doc.sourceUrl &&
    resource.web_view_link &&
    doc.sourceUrl === resource.web_view_link
  ) {
    return true;
  }

  return false;
}

export const GoogleDocsKnowledgeSection: React.FC<GoogleDocsKnowledgeSectionProps> = ({
  value,
  onChange,
  workspaceId,
  agentId,
  agentName,
  docsRefreshKey = 0,
  onKnowledgeDocSynced,
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

  // Real backend knowledge_documents state strictly scoped to the currently open agent
  const [agentGoogleDocs, setAgentGoogleDocs] = useState<KnowledgeDocument[]>([]);
  const [isLoadingSyncedDocs, setIsLoadingSyncedDocs] = useState<boolean>(false);
  const [syncingResourceIds, setSyncingResourceIds] = useState<
    Record<string, boolean>
  >({});
  const [runtimeSyncByResource, setRuntimeSyncByResource] = useState<
    Record<string, RuntimeSyncEntry>
  >({});
  const [reconnectRequiredBanner, setReconnectRequiredBanner] = useState<
    string | null
  >(null);

  const valueRef = useRef<GoogleWorkspaceConfig | undefined>(value);
  valueRef.current = value;
  const onChangeRef = useRef<typeof onChange>(onChange);
  onChangeRef.current = onChange;
  const onKnowledgeDocSyncedRef = useRef<typeof onKnowledgeDocSynced>(
    onKnowledgeDocSynced
  );
  onKnowledgeDocSyncedRef.current = onKnowledgeDocSynced;

  const hasSavedCurrentAgent = Boolean(agentId && isValidUuid(agentId));

  useEffect(() => {
    setResolvedWorkspaceId(workspaceId || null);
  }, [workspaceId]);

  // Reset per-agent runtime sync cache when switching to a different agent
  useEffect(() => {
    setRuntimeSyncByResource({});
    setSyncingResourceIds({});
    setReconnectRequiredBanner(null);
  }, [agentId]);

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

  const refreshSyncedGoogleDocs = useCallback(
    async (wsId?: string | null): Promise<KnowledgeDocument[]> => {
      const targetWsId = wsId || effectiveWorkspaceId;
      if (!targetWsId || !isValidUuid(targetWsId) || !agentId || !isValidUuid(agentId)) {
        setAgentGoogleDocs([]);
        return [];
      }

      setIsLoadingSyncedDocs(true);
      try {
        const rows = await getWorkspaceGoogleDocKnowledgeRecords(targetWsId, agentId);
        setAgentGoogleDocs(rows);
        return rows;
      } catch {
        return [];
      } finally {
        setIsLoadingSyncedDocs(false);
      }
    },
    [effectiveWorkspaceId, agentId]
  );

  useEffect(() => {
    void refreshSyncedGoogleDocs(effectiveWorkspaceId);
  }, [effectiveWorkspaceId, agentId, docsRefreshKey, refreshSyncedGoogleDocs]);

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
            setReconnectRequiredBanner(null);
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
      setReconnectRequiredBanner(null);
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
      void refreshSyncedGoogleDocs();
    }
  }, [resourceToRemove, docsResources, refreshSyncedGoogleDocs]);

  /**
   * Automatically syncs a selected Google Doc to the currently open agent's Knowledge Base.
   * Never prompts the owner to pick another agent.
   */
  const handleSyncResourceForCurrentAgent = useCallback(
    async (resource: GoogleAuthorizedResource) => {
      if (!connectionId || !effectiveWorkspaceId) {
        toast.error(
          'Connect Google Docs and ensure an active workspace is loaded before syncing.'
        );
        return;
      }

      if (!agentId || !isValidUuid(agentId)) {
        toast.error(
          'Please save and create this agent first before indexing Google Docs into its Knowledge Base.'
        );
        return;
      }

      if (syncingResourceIds[resource.id]) return;

      setSyncingResourceIds((prev) => ({ ...prev, [resource.id]: true }));
      setRuntimeSyncByResource((prev) => ({
        ...prev,
        [resource.id]: {
          resourceId: resource.id,
          agentId,
          status: 'processing',
          chunkCount: prev[resource.id]?.chunkCount ?? null,
          sourceModifiedTime: prev[resource.id]?.sourceModifiedTime ?? null,
          error: null,
          stage: null,
          documentId: prev[resource.id]?.documentId ?? null,
          reconnectRequired: false,
        },
      }));

      try {
        const outcome = await syncGoogleDocToKnowledgeBase({
          workspaceId: effectiveWorkspaceId,
          connectionId,
          resourceId: resource.id,
          agentId,
        });

        const classifiedError = outcome.error
          ? classifyKnowledgeProcessingError({
              message: outcome.error,
              stage: outcome.stage,
              reconnectRequired: outcome.reconnectRequired,
            })
          : null;

        setRuntimeSyncByResource((prev) => ({
          ...prev,
          [resource.id]: {
            resourceId: resource.id,
            agentId,
            status: outcome.status,
            chunkCount:
              outcome.document?.chunkCount ?? outcome.chunksCreated ?? null,
            sourceModifiedTime:
              outcome.sourceModifiedTime ??
              outcome.document?.sourceModifiedTime ??
              null,
            error: outcome.error,
            stage: outcome.stage ?? classifiedError?.stage ?? null,
            documentId: outcome.documentId,
            reconnectRequired:
              classifiedError?.category === 'google_auth' ||
              Boolean(
                outcome.reconnectRequired &&
                  classifiedError?.category !== 'openai_embedding_auth'
              ),
          },
        }));

        if (classifiedError?.category === 'google_auth') {
          setReconnectRequiredBanner(classifiedError.detail);
        }

        const refreshedRows = await refreshSyncedGoogleDocs(
          outcome.workspaceId || effectiveWorkspaceId
        );

        const persistedDoc =
          (outcome.documentId
            ? refreshedRows.find((r) => r.id === outcome.documentId)
            : null) || outcome.document;

        if (persistedDoc && onKnowledgeDocSyncedRef.current) {
          onKnowledgeDocSyncedRef.current(persistedDoc, agentId);
        }

        // Strict rule: ONLY display success when success === true AND document.status === 'ready'
        if (outcome.success && outcome.isReady && outcome.status === 'ready') {
          setReconnectRequiredBanner(null);
          const count = persistedDoc?.chunkCount ?? outcome.chunksCreated ?? 0;
          toast.success(
            `Synced "${resource.name}" (${count} ${
              count === 1 ? 'chunk' : 'chunks'
            }, Ready).`
          );
        } else if (classifiedError) {
          const stageSuffix = classifiedError.stage
            ? ` [stage: ${classifiedError.stage}]`
            : '';
          toast.error(
            `${classifiedError.title}: ${classifiedError.detail}${stageSuffix}`,
            { duration: 9000 }
          );
        } else {
          toast.info(
            `"${resource.name}" status: ${outcome.status || 'queued'}.`
          );
        }
      } catch (err: any) {
        const errMsg =
          err?.message ||
          `Failed to sync "${resource.name}" to this agent's Knowledge Base.`;
        const classified = classifyKnowledgeProcessingError({ message: errMsg });
        setRuntimeSyncByResource((prev) => ({
          ...prev,
          [resource.id]: {
            resourceId: resource.id,
            agentId,
            status: 'failed',
            chunkCount: prev[resource.id]?.chunkCount ?? null,
            sourceModifiedTime: prev[resource.id]?.sourceModifiedTime ?? null,
            error: errMsg,
            stage: classified.stage,
            documentId: prev[resource.id]?.documentId ?? null,
            reconnectRequired: classified.category === 'google_auth',
          },
        }));
        toast.error(`${classified.title}: ${errMsg}`, { duration: 9000 });
      } finally {
        setSyncingResourceIds((prev) => {
          const next = { ...prev };
          delete next[resource.id];
          return next;
        });
      }
    },
    [
      connectionId,
      effectiveWorkspaceId,
      agentId,
      syncingResourceIds,
      refreshSyncedGoogleDocs,
    ]
  );

  const handleSelectDocs = useCallback(async () => {
    const pickedResources = await docsResources.selectResources();
    if (pickedResources.length === 0) return;

    if (!agentId || !isValidUuid(agentId)) {
      toast.info(
        'Google Doc selected. Save this agent first to sync and index it into this agent’s Knowledge Base.'
      );
      return;
    }

    for (const resource of pickedResources) {
      await handleSyncResourceForCurrentAgent(resource);
    }
  }, [docsResources, agentId, handleSyncResourceForCurrentAgent]);

  const renderResourceSyncExtra = useCallback(
    (resource: GoogleAuthorizedResource) => {
      const dbDoc =
        agentGoogleDocs.find((doc) => matchesGoogleResource(doc, resource)) ||
        null;
      const runtime = runtimeSyncByResource[resource.id] || null;
      const isSyncingThis = Boolean(syncingResourceIds[resource.id]);

      if (!hasSavedCurrentAgent) {
        return (
          <div className="pl-0 sm:pl-10 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">
              Save this agent first to sync and index this Google Doc into its Knowledge Base.
            </span>
          </div>
        );
      }

      if (!dbDoc && !runtime && !isSyncingThis) {
        return (
          <div className="pl-0 sm:pl-10 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            <span className="text-[11px] text-muted-foreground">
              {isLoadingSyncedDocs
                ? 'Checking Knowledge Base sync status…'
                : `Not synced to ${agentName ? `"${agentName}"` : 'this agent'} yet.`}
            </span>
            <button
              type="button"
              disabled={isConnecting || isDisconnecting || !connectionId}
              onClick={() => void handleSyncResourceForCurrentAgent(resource)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className="size-3" />
              <span>Sync</span>
            </button>
          </div>
        );
      }

      const effectiveStatus: KnowledgeDocumentStatus = isSyncingThis
        ? 'processing'
        : runtime?.error && runtime.status === 'failed'
        ? 'failed'
        : dbDoc?.status || runtime?.status || 'queued';

      const isReady = effectiveStatus === 'ready' && !isSyncingThis;
      const isFailed = effectiveStatus === 'failed' && !isSyncingThis;
      const isProcessing = isSyncingThis || effectiveStatus === 'processing';

      const effectiveChunkCount =
        typeof dbDoc?.chunkCount === 'number'
          ? dbDoc.chunkCount
          : typeof runtime?.chunkCount === 'number'
          ? runtime.chunkCount
          : null;

      const effectiveSourceModified =
        dbDoc?.sourceModifiedTime || runtime?.sourceModifiedTime || null;
      const formattedSourceModified = formatDateTimeLabel(
        effectiveSourceModified
      );

      const rawErrorMessage =
        runtime?.error || (isFailed ? dbDoc?.errorMessage || null : null);
      const classifiedError = rawErrorMessage
        ? classifyKnowledgeProcessingError({
            message: rawErrorMessage,
            stage: runtime?.stage ?? null,
            reconnectRequired: runtime?.reconnectRequired ?? false,
          })
        : null;

      const statusBadgeClass = isReady
        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
        : isFailed
        ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25';

      const statusLabel = isProcessing
        ? 'Processing'
        : isReady
        ? 'Ready'
        : isFailed
        ? 'Failed'
        : 'Queued';

      return (
        <div className="pl-0 sm:pl-10 space-y-2 pt-2 border-t border-border/60">
          <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${statusBadgeClass}`}
                >
                  {isProcessing ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : isReady ? (
                    <CheckCircle2 className="size-2.5" />
                  ) : isFailed ? (
                    <AlertCircle className="size-2.5" />
                  ) : (
                    <Clock className="size-2.5" />
                  )}
                  <span>{statusLabel}</span>
                </span>

                {effectiveChunkCount !== null &&
                  (isReady || effectiveChunkCount > 0) && (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                      {effectiveChunkCount}{' '}
                      {effectiveChunkCount === 1 ? 'chunk' : 'chunks'}
                    </span>
                  )}

                {formattedSourceModified && (
                  <span className="text-[10px] text-muted-foreground">
                    Source modified {formattedSourceModified}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                <button
                  type="button"
                  disabled={isSyncingThis || isConnecting || isDisconnecting}
                  onClick={() => void handleSyncResourceForCurrentAgent(resource)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background hover:bg-accent px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <RefreshCw
                    className={`size-3 ${isSyncingThis ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {isSyncingThis
                      ? 'Syncing…'
                      : isFailed
                      ? 'Retry'
                      : 'Sync'}
                  </span>
                </button>
              </div>
            </div>

            {classifiedError && (
              <div
                className={`rounded-lg border px-2.5 py-2 flex flex-col sm:flex-row sm:items-start justify-between gap-2 ${
                  classifiedError.category === 'google_auth'
                    ? 'border-amber-500/30 bg-amber-500/10'
                    : 'border-red-500/25 bg-red-500/10'
                }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  {classifiedError.category === 'openai_embedding_auth' ? (
                    <KeyRound className="size-3.5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle
                      className={`size-3.5 shrink-0 mt-0.5 ${
                        classifiedError.category === 'google_auth'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    />
                  )}
                  <div className="space-y-1 min-w-0 text-[11px] leading-snug break-words">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-semibold ${
                          classifiedError.category === 'google_auth'
                            ? 'text-amber-800 dark:text-amber-200'
                            : 'text-red-700 dark:text-red-300'
                        }`}
                      >
                        {classifiedError.title}
                      </span>
                      {classifiedError.stage && (
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            classifiedError.category === 'google_auth'
                              ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                              : 'bg-red-500/15 text-red-700 dark:text-red-300'
                          }`}
                        >
                          stage: {classifiedError.stage}
                        </span>
                      )}
                    </div>
                    <p
                      className={
                        classifiedError.category === 'google_auth'
                          ? 'text-amber-800/90 dark:text-amber-200/90'
                          : 'text-red-700/90 dark:text-red-300/90'
                      }
                    >
                      {classifiedError.summary}
                    </p>
                    <p
                      className={`text-[10px] font-mono opacity-85 ${
                        classifiedError.category === 'google_auth'
                          ? 'text-amber-900 dark:text-amber-100'
                          : 'text-red-800 dark:text-red-200'
                      }`}
                    >
                      {classifiedError.detail}
                    </p>
                  </div>
                </div>

                {classifiedError.category === 'google_auth' && (
                  <button
                    type="button"
                    disabled={isConnecting || isDisconnecting}
                    onClick={() => void handleConnectDocs()}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 text-[11px] font-semibold shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className="size-3" />
                    <span>Reconnect Google Docs</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      );
    },
    [
      agentGoogleDocs,
      runtimeSyncByResource,
      syncingResourceIds,
      hasSavedCurrentAgent,
      isLoadingSyncedDocs,
      agentName,
      isConnecting,
      isDisconnecting,
      connectionId,
      handleSyncResourceForCurrentAgent,
    ]
  );

  const readyDocsCount = useMemo(() => {
    const readyResourceIds = new Set<string>();
    for (const res of docsResources.resources) {
      const hasReady = agentGoogleDocs.some(
        (doc) => doc.status === 'ready' && matchesGoogleResource(doc, res)
      );
      if (hasReady) {
        readyResourceIds.add(res.id);
      }
    }
    return readyResourceIds.size;
  }, [docsResources.resources, agentGoogleDocs]);

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

      {reconnectRequiredBanner && status === 'connected' && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                Google Docs Reconnection Required
              </p>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90 leading-relaxed break-words">
                {reconnectRequiredBanner}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void handleConnectDocs()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className="size-3.5" />
              <span>Reconnect Google Docs</span>
            </button>
            <button
              type="button"
              onClick={() => setReconnectRequiredBanner(null)}
              className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </div>
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
                    'Reconnect your Google Docs account with read-only permissions to select and sync documents into this agent’s Knowledge Base.'
                  : 'Connect your Google Docs account with read-only permissions to select and sync native Google Docs into this agent’s Knowledge Base.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
              <span className="px-2 py-0.5 rounded-md bg-muted font-medium border border-border">
                Google Docs
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
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-white dark:bg-muted p-2 shrink-0 shadow-2xs">
                <GoogleDocsLogo className="size-5" />
              </div>

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
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-muted text-foreground/85 border border-border">
                    <span>
                      {docsResources.activeCount}{' '}
                      {docsResources.activeCount === 1 ? 'Doc' : 'Docs'} selected
                      {readyDocsCount > 0 ? ` · ${readyDocsCount} Ready` : ''}
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
            selectedAgentResourceIds={
              onChange ? value?.docs?.selectedResourceIds : undefined
            }
            onToggleAgentResource={
              onChange ? handleToggleAgentDocResource : undefined
            }
            onSelectResources={() => void handleSelectDocs()}
            onRequestRemoveResource={(res) => setResourceToRemove(res)}
            onRefreshResources={() => {
              void docsResources.refreshResources();
              void refreshSyncedGoogleDocs();
            }}
            onConnectService={() => void handleConnectDocs()}
            onClearError={docsResources.clearResourcesError}
            renderResourceExtra={renderResourceSyncExtra}
          />
        </div>
      )}

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
