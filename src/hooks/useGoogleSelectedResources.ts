import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  GoogleAuthorizedResource,
  GoogleWorkspaceIntegrationStatus,
} from '../types';
import {
  getGooglePickerToken,
  getGoogleSelectedResources,
  removeGoogleSelectedResource,
  saveGoogleSelectedResources,
} from '../lib/supabaseService';
import {
  GooglePickerInitialView,
  openGooglePicker,
  resolveGooglePickerConfig,
  verifyGooglePickerAccessToken,
} from '../lib/googlePicker';

interface UseGoogleSelectedResourcesParams {
  workspaceId?: string | null;
  connectionId?: string | null;
  status: GoogleWorkspaceIntegrationStatus;
  driveAccountEmail?: string | null;
  agentId?: string | null;
  onResourcesUpdated?: (activeResourceIds: string[]) => void;
}

export interface UseGoogleSelectedResourcesReturn {
  resources: GoogleAuthorizedResource[];
  selectedCount: number;
  activeCount: number;
  selectionRequired: boolean;
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

export function useGoogleSelectedResources({
  workspaceId,
  connectionId,
  status,
  driveAccountEmail,
  agentId,
  onResourcesUpdated,
}: UseGoogleSelectedResourcesParams): UseGoogleSelectedResourcesReturn {
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

  const onResourcesUpdatedRef = useRef(onResourcesUpdated);
  onResourcesUpdatedRef.current = onResourcesUpdated;

  const isSelectingRef = useRef<boolean>(false);

  const resetResourceState = useCallback(() => {
    setResources([]);
    setSelectedCount(0);
    setActiveCount(0);
    setSelectionRequired(true);
    setResourcesError(null);
  }, []);

  const refreshResources = useCallback(async () => {
    if (status === 'disconnected' || !connectionId || !workspaceId) {
      resetResourceState();
      return;
    }

    // Do not try to load resources if Google authorization is expired until user reconnects
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
        workspaceId,
        connectionId,
        agentId,
      });

      // Only show active authorized resources returned by the backend
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
        err?.message || 'Could not load authorized Google Drive resources.';
      setResourcesError(msg);
      setResources([]);
      setSelectedCount(0);
      setActiveCount(0);
    } finally {
      setIsLoadingResources(false);
    }
  }, [workspaceId, connectionId, status, agentId, resetResourceState]);

  // Reset and reload resources whenever workspace, connection, or status changes
  useEffect(() => {
    resetResourceState();
    void refreshResources();
  }, [refreshResources, resetResourceState]);

  const selectResources = useCallback(
    async (initialView: GooglePickerInitialView = 'all') => {
      if (isSelectingRef.current || isSavingSelection || removingResourceId) {
        return;
      }

      if (status !== 'connected' || !connectionId) {
        const msg =
          status === 'expired'
            ? 'Your Google Drive authorization has expired. Please reconnect Google Drive first.'
            : 'Connect your Google Drive account before selecting resources.';
        setResourcesError(msg);
        toast.error(msg);
        return;
      }

      if (!workspaceId) {
        const msg = 'Active workspace ID could not be resolved.';
        setResourcesError(msg);
        toast.error(msg);
        return;
      }

      isSelectingRef.current = true;
      setResourcesError(null);
      setIsFetchingPickerToken(true);

      try {
        // Step 1: Fetch short-lived access token from `google_workspace` (never stored in browser storage)
        const tokenPayload = await getGooglePickerToken({
          workspaceId,
          connectionId,
          agentId,
        });

        // Resolve frontend env configuration (VITE_GOOGLE_PICKER_API_KEY / VITE_GOOGLE_CLIENT_ID)
        // with optional backend metadata overrides
        const preResolved = resolveGooglePickerConfig({
          apiKey: tokenPayload.apiKey,
          clientId: tokenPayload.clientId,
          appId: tokenPayload.appId,
        });

        // Step 2: Verify the token belongs to the connected account, carries Drive scope,
        // and confirm the Google Cloud project number (appId)
        const expectedAccountEmail =
          tokenPayload.accountEmail || driveAccountEmail || null;

        const tokenCheck = await verifyGooglePickerAccessToken({
          accessToken: tokenPayload.accessToken,
          expectedAccountEmail,
          expectedAppId: preResolved.appId,
        });

        if (!tokenCheck.valid) {
          throw new Error(
            tokenCheck.error ||
              'Google Drive authorization token verification failed. Please reconnect Google Drive.'
          );
        }

        const effectiveClientId =
          preResolved.clientId || tokenCheck.azp || tokenPayload.clientId || null;
        const effectiveAppId =
          preResolved.appId || tokenCheck.projectNumber || tokenPayload.appId || null;

        setIsFetchingPickerToken(false);
        setIsPickerOpen(true);

        // Step 3: Load & open official Google Picker modal
        const pickerResult = await openGooglePicker({
          accessToken: tokenPayload.accessToken,
          apiKey: preResolved.apiKey,
          clientId: effectiveClientId,
          appId: effectiveAppId,
          initialView,
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

        // Step 5: Send only google_file_id values to `google_workspace` (`action: "save_selected_resources"`)
        setIsSavingSelection(true);
        const saveResult = await saveGoogleSelectedResources({
          workspaceId,
          connectionId,
          selectedFiles: pickerResult.files,
          agentId,
        });

        // Step 6: Refresh authorized resources list from backend before showing confirmation
        await refreshResources();
        toast.success(saveResult.message);
      } catch (err: any) {
        setIsFetchingPickerToken(false);
        setIsPickerOpen(false);
        const msg =
          err?.message || 'Failed to select or authorize Google Drive resources.';
        console.error('[Google Picker] Selection flow error:', {
          message: msg,
          workspaceId,
          connectionId,
          initialView,
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
      status,
      connectionId,
      workspaceId,
      driveAccountEmail,
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
        const msg = 'Missing active workspace or Google Drive connection ID.';
        setResourcesError(msg);
        toast.error(msg);
        return false;
      }

      setRemovingResourceId(resource.id);
      setResourcesError(null);

      try {
        const res = await removeGoogleSelectedResource({
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
      removingResourceId,
      isSavingSelection,
      connectionId,
      workspaceId,
      agentId,
      refreshResources,
    ]
  );

  return {
    resources,
    selectedCount,
    activeCount,
    selectionRequired,
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
