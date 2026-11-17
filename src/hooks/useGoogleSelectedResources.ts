import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import {
  GoogleAuthorizedResource,
  GoogleResourceServiceKey,
  GoogleWorkspaceIntegrationStatus,
} from '../types';
import {
  evaluateGoogleConnectionScopes,
  getGooglePickerToken,
  getGoogleSelectedResources,
  GOOGLE_WORKSPACE_SERVICE_LABELS,
  isGoogleScopeReauthError,
  removeGoogleSelectedResource,
  saveGoogleSelectedResources,
} from '../lib/supabaseService';
import {
  filterAndValidatePickerFiles,
  GooglePickerInitialView,
  openGooglePicker,
  resolveGooglePickerConfig,
  verifyGooglePickerAccessToken,
} from '../lib/googlePicker';

interface UseGoogleSelectedResourcesParams {
  service: GoogleResourceServiceKey;
  workspaceId?: string | null;
  connectionId?: string | null;
  status: GoogleWorkspaceIntegrationStatus;
  accountEmail?: string | null;
  connectionScopes?: string[];
  agentId?: string | null;
  onResourcesUpdated?: (activeResourceIds: string[]) => void;
}

export interface UseGoogleSelectedResourcesReturn {
  service: GoogleResourceServiceKey;
  resources: GoogleAuthorizedResource[];
  selectedCount: number;
  activeCount: number;
  selectionRequired: boolean;
  needsScopeReauth: boolean;
  scopeReauthMessage: string | null;
  missingScopes: string[];
  isLoadingResources: boolean;
  isFetchingPickerToken: boolean;
  isPickerOpen: boolean;
  isSavingSelection: boolean;
  removingResourceId: string | null;
  resourcesError: string | null;
  clearResourcesError: () => void;
  refreshResources: () => Promise<void>;
  selectResources: (initialView?: GooglePickerInitialView) => Promise<void>;
  removeResource: (resource: GoogleAuthorizedResource) => Promise<boolean>;
}

function getDefaultInitialViewForService(
  service: GoogleResourceServiceKey
): GooglePickerInitialView {
  if (service === 'google_docs') return 'documents';
  if (service === 'google_sheets_service') return 'spreadsheets';
  return 'drive';
}

export function useGoogleSelectedResources({
  service,
  workspaceId,
  connectionId,
  status,
  accountEmail,
  connectionScopes,
  agentId,
  onResourcesUpdated,
}: UseGoogleSelectedResourcesParams): UseGoogleSelectedResourcesReturn {
  const serviceLabel = GOOGLE_WORKSPACE_SERVICE_LABELS[service];

  const [resources, setResources] = useState<GoogleAuthorizedResource[]>([]);
  const [selectedCount, setSelectedCount] = useState<number>(0);
  const [activeCount, setActiveCount] = useState<number>(0);
  const [selectionRequired, setSelectionRequired] = useState<boolean>(true);

  const [isLoadingResources, setIsLoadingResources] = useState<boolean>(false);
  const [isFetchingPickerToken, setIsFetchingPickerToken] = useState<boolean>(false);
  const [isPickerOpen, setIsPickerOpen] = useState<boolean>(false);
  const [isSavingSelection, setIsSavingSelection] = useState<boolean>(false);
  const [removingResourceId, setRemovingResourceId] = useState<string | null>(null);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [runtimeScopeReauthMessage, setRuntimeScopeReauthMessage] = useState<
    string | null
  >(null);
  const [runtimeMissingScopes, setRuntimeMissingScopes] = useState<string[]>([]);

  const onResourcesUpdatedRef = useRef(onResourcesUpdated);
  onResourcesUpdatedRef.current = onResourcesUpdated;

  const isSelectingRef = useRef<boolean>(false);

  const proactiveScopeCheck = useMemo(
    () =>
      status === 'connected'
        ? evaluateGoogleConnectionScopes(service, connectionScopes)
        : {
            hasRecordedScopes: false,
            missingScopes: [],
            needsReconnect: false,
            message: null,
          },
    [service, status, connectionScopes]
  );

  const needsScopeReauth = Boolean(
    status === 'connected' &&
      (proactiveScopeCheck.needsReconnect || runtimeScopeReauthMessage)
  );
  const scopeReauthMessage =
    proactiveScopeCheck.message || runtimeScopeReauthMessage || null;
  const missingScopes = useMemo(() => {
    const proactive = proactiveScopeCheck.missingScopes.map((s) => s.shortName);
    return Array.from(new Set([...proactive, ...runtimeMissingScopes]));
  }, [proactiveScopeCheck.missingScopes, runtimeMissingScopes]);

  const resetResourceState = useCallback(() => {
    setResources([]);
    setSelectedCount(0);
    setActiveCount(0);
    setSelectionRequired(true);
    setResourcesError(null);
    setRuntimeScopeReauthMessage(null);
    setRuntimeMissingScopes([]);
  }, []);

  const refreshResources = useCallback(async () => {
    if (status === 'disconnected' || !connectionId || !workspaceId) {
      resetResourceState();
      return;
    }

    // Do not try to load resources if authorization is expired until user reconnects
    if (status === 'expired') {
      setResources([]);
      setSelectedCount(0);
      setActiveCount(0);
      setSelectionRequired(false);
      return;
    }

    setIsLoadingResources(true);
    setResourcesError(null);

    try {
      const result = await getGoogleSelectedResources({
        service,
        workspaceId,
        connectionId,
        agentId,
      });

      // Only show active authorized resources returned for this exact connection ID
      const activeResources = result.resources.filter(
        (r) => !r.status || r.status === 'active'
      );

      setResources(activeResources);
      setSelectedCount(result.selectedCount);
      setActiveCount(result.activeCount);
      setSelectionRequired(result.selectionRequired);

      if (onResourcesUpdatedRef.current) {
        onResourcesUpdatedRef.current(activeResources.map((r) => r.id));
      }
    } catch (err: any) {
      const msg =
        err?.message ||
        `Could not load authorized ${serviceLabel} resources.`;
      if (isGoogleScopeReauthError(msg)) {
        setRuntimeScopeReauthMessage(msg);
      }
      setResourcesError(msg);
      setResources([]);
      setSelectedCount(0);
      setActiveCount(0);
    } finally {
      setIsLoadingResources(false);
    }
  }, [
    service,
    serviceLabel,
    workspaceId,
    connectionId,
    status,
    agentId,
    resetResourceState,
  ]);

  // Reset and reload resources whenever workspace, connection, or status changes
  useEffect(() => {
    resetResourceState();
    void refreshResources();
  }, [refreshResources, resetResourceState, connectionScopes]);

  const selectResources = useCallback(
    async (initialView?: GooglePickerInitialView) => {
      if (isSelectingRef.current || isSavingSelection || removingResourceId) {
        return;
      }

      if (status !== 'connected' || !connectionId) {
        const msg =
          status === 'expired'
            ? `Your ${serviceLabel} authorization has expired. Please reconnect ${serviceLabel} first.`
            : `Connect your ${serviceLabel} account before selecting resources.`;
        setResourcesError(msg);
        toast.error(msg);
        return;
      }

      if (needsScopeReauth) {
        const msg =
          scopeReauthMessage ||
          `${serviceLabel} requires updated Google OAuth permissions. Please reconnect ${serviceLabel}.`;
        setResourcesError(msg);
        toast.error(msg, { duration: 7000 });
        return;
      }

      if (!workspaceId) {
        const msg = 'Active workspace ID could not be resolved.';
        setResourcesError(msg);
        toast.error(msg);
        return;
      }

      const effectiveInitialView =
        initialView || getDefaultInitialViewForService(service);

      isSelectingRef.current = true;
      setResourcesError(null);
      setIsFetchingPickerToken(true);

      try {
        // Step 1: Fetch short-lived access token from `google_workspace` strictly for this connection ID
        const tokenPayload = await getGooglePickerToken({
          service,
          workspaceId,
          connectionId,
          agentId,
        });

        // Also validate scope metadata if returned directly by picker_token
        if (tokenPayload.scope) {
          const payloadScopeEval = evaluateGoogleConnectionScopes(
            service,
            tokenPayload.scope
          );
          if (payloadScopeEval.needsReconnect) {
            setRuntimeMissingScopes(
              payloadScopeEval.missingScopes.map((s) => s.shortName)
            );
            setRuntimeScopeReauthMessage(
              payloadScopeEval.message ||
                `${serviceLabel} requires updated Google permissions. Please reconnect ${serviceLabel}.`
            );
            throw new Error(
              payloadScopeEval.message ||
                `${serviceLabel} is missing required OAuth permissions. Please reconnect ${serviceLabel}.`
            );
          }
        }

        // Resolve frontend env configuration (VITE_GOOGLE_PICKER_API_KEY / VITE_GOOGLE_CLIENT_ID)
        const preResolved = resolveGooglePickerConfig({
          apiKey: tokenPayload.apiKey,
          clientId: tokenPayload.clientId,
          appId: tokenPayload.appId,
        });

        // Step 2: Verify token identity & service-required scopes via Google tokeninfo
        const expectedAccountEmail =
          tokenPayload.accountEmail || accountEmail || null;

        const tokenCheck = await verifyGooglePickerAccessToken({
          service,
          accessToken: tokenPayload.accessToken,
          expectedAccountEmail,
          expectedAppId: preResolved.appId,
        });

        if (!tokenCheck.valid) {
          if (tokenCheck.needsReconnect || tokenCheck.missingScopes.length > 0) {
            setRuntimeMissingScopes(tokenCheck.missingScopes);
            setRuntimeScopeReauthMessage(
              tokenCheck.error ||
                `Please reconnect ${serviceLabel} to grant updated permissions.`
            );
          }
          throw new Error(
            tokenCheck.error ||
              `${serviceLabel} authorization token verification failed. Please reconnect ${serviceLabel}.`
          );
        }

        const effectiveClientId =
          preResolved.clientId || tokenCheck.azp || tokenPayload.clientId || null;
        const effectiveAppId =
          preResolved.appId || tokenCheck.projectNumber || tokenPayload.appId || null;

        setIsFetchingPickerToken(false);
        setIsPickerOpen(true);

        // Step 3: Load & open service-specific Google Picker modal
        const pickerResult = await openGooglePicker({
          accessToken: tokenPayload.accessToken,
          apiKey: preResolved.apiKey,
          clientId: effectiveClientId,
          appId: effectiveAppId,
          initialView: effectiveInitialView,
        });

        setIsPickerOpen(false);

        // Step 4: If customer cancelled, close quietly without any error
        if (pickerResult.cancelled) {
          return;
        }

        if (!pickerResult.files || pickerResult.files.length === 0) {
          toast.info('No files were selected.');
          return;
        }

        // Step 5: Filter and reject disallowed file types before calling save_selected_resources
        const { validFiles, rejectedFiles, rejectionMessage } =
          filterAndValidatePickerFiles(service, pickerResult.files);

        if (rejectedFiles.length > 0 && validFiles.length === 0) {
          const rejectMsg =
            rejectionMessage ||
            `Selected files are not allowed in ${serviceLabel}.`;
          setResourcesError(rejectMsg);
          toast.error(rejectMsg, { duration: 7000 });
          return;
        }

        if (rejectedFiles.length > 0 && rejectionMessage) {
          toast.warning(rejectionMessage, { duration: 7000 });
        }

        // Step 6: Send only google_file_id values for this exact connection_id
        setIsSavingSelection(true);
        const saveResult = await saveGoogleSelectedResources({
          service,
          workspaceId,
          connectionId,
          selectedFiles: validFiles,
          agentId,
        });

        if (
          saveResult.rejectedCount > 0 &&
          saveResult.rejectedReasons.length > 0
        ) {
          toast.warning(
            `${serviceLabel} rejected ${
              saveResult.rejectedCount
            } file(s): ${saveResult.rejectedReasons.join('; ')}`,
            { duration: 7000 }
          );
        }

        // Step 7: Refresh authorized resources list from backend before showing confirmation
        await refreshResources();
        toast.success(saveResult.message);
      } catch (err: any) {
        setIsFetchingPickerToken(false);
        setIsPickerOpen(false);
        const msg =
          err?.message ||
          `Failed to select or authorize ${serviceLabel} resources.`;
        if (isGoogleScopeReauthError(msg)) {
          setRuntimeScopeReauthMessage(msg);
        }
        console.error('[Google Picker] Selection flow error:', {
          service,
          message: msg,
          workspaceId,
          connectionId,
          initialView: effectiveInitialView,
        });
        setResourcesError(msg);
        toast.error(msg, { duration: 7000 });
      } finally {
        setIsFetchingPickerToken(false);
        setIsPickerOpen(false);
        setIsSavingSelection(false);
        isSelectingRef.current = false;
      }
    },
    [
      service,
      serviceLabel,
      status,
      connectionId,
      workspaceId,
      accountEmail,
      needsScopeReauth,
      scopeReauthMessage,
      agentId,
      isSavingSelection,
      removingResourceId,
      refreshResources,
    ]
  );

  const removeResource = useCallback(
    async (resource: GoogleAuthorizedResource): Promise<boolean> => {
      if (removingResourceId || isSavingSelection || isSelectingRef.current) {
        return false;
      }

      if (!connectionId || !workspaceId) {
        const msg = `Missing active workspace or ${serviceLabel} connection ID.`;
        setResourcesError(msg);
        toast.error(msg);
        return false;
      }

      setRemovingResourceId(resource.id);
      setResourcesError(null);

      try {
        const res = await removeGoogleSelectedResource({
          service,
          workspaceId,
          connectionId,
          resourceId: resource.id,
          agentId,
        });

        await refreshResources();
        toast.success(res.message);
        return true;
      } catch (err: any) {
        const msg =
          err?.message ||
          `Could not remove authorization for "${resource.name}".`;
        setResourcesError(msg);
        toast.error(msg, { duration: 7000 });
        return false;
      } finally {
        setRemovingResourceId(null);
      }
    },
    [
      service,
      serviceLabel,
      removingResourceId,
      isSavingSelection,
      connectionId,
      workspaceId,
      agentId,
      refreshResources,
    ]
  );

  return {
    service,
    resources,
    selectedCount,
    activeCount,
    selectionRequired,
    needsScopeReauth,
    scopeReauthMessage,
    missingScopes,
    isLoadingResources,
    isFetchingPickerToken,
    isPickerOpen,
    isSavingSelection,
    removingResourceId,
    resourcesError,
    clearResourcesError: () => setResourcesError(null),
    refreshResources,
    selectResources,
    removeResource,
  };
}
