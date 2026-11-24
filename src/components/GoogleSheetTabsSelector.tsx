import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  EyeOff,
  Loader2,
  RefreshCw,
  Save,
  Table2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  ClassifiedGoogleSheetTabError,
  GoogleAuthorizedResource,
  GoogleSpreadsheetTab,
} from '../types';
import {
  classifyGoogleSheetTabError,
  getAgentSheetTabs,
  isValidUuid,
  listSpreadsheetTabs,
  saveAgentSheetTabs,
} from '../lib/supabaseService';

interface GoogleSheetTabsSelectorProps {
  workspaceId: string | null;
  agentId?: string | null;
  connectionId: string | null;
  resource: GoogleAuthorizedResource;
  refreshTrigger?: number;
  isBusyConnectingOrDisconnecting?: boolean;
  onLoadingChange?: (resourceId: string, loading: boolean) => void;
  onReconnectSheets: () => void;
}

function areSheetIdListsEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort((x, y) => x - y);
  const sortedB = [...b].sort((x, y) => x - y);
  return sortedA.every((val, idx) => val === sortedB[idx]);
}

export const GoogleSheetTabsSelector: React.FC<GoogleSheetTabsSelectorProps> = ({
  workspaceId,
  agentId,
  connectionId,
  resource,
  refreshTrigger = 0,
  isBusyConnectingOrDisconnecting = false,
  onLoadingChange,
  onReconnectSheets,
}) => {
  const hasSavedAgent = Boolean(agentId && isValidUuid(agentId));

  const [spreadsheetTitle, setSpreadsheetTitle] = useState<string>(resource.name);
  const [tabs, setTabs] = useState<GoogleSpreadsheetTab[]>([]);
  const [savedSheetIds, setSavedSheetIds] = useState<number[]>([]);
  const [draftSheetIds, setDraftSheetIds] = useState<number[]>([]);
  const [hasLoadedTabs, setHasLoadedTabs] = useState<boolean>(false);
  const [hasLoadedSavedConfig, setHasLoadedSavedConfig] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [actionError, setActionError] =
    useState<ClassifiedGoogleSheetTabError | null>(null);

  const requestSeqRef = useRef<number>(0);
  const lastRefreshTriggerRef = useRef<number>(refreshTrigger);
  const onLoadingChangeRef = useRef(onLoadingChange);
  onLoadingChangeRef.current = onLoadingChange;

  useEffect(() => {
    onLoadingChangeRef.current?.(resource.id, isLoading);
  }, [resource.id, isLoading]);

  useEffect(() => {
    const id = resource.id;
    return () => {
      onLoadingChangeRef.current?.(id, false);
    };
  }, [resource.id]);

  const loadTabsAndSavedSelection = useCallback(
    async (opts?: { preserveDraft?: boolean }) => {
      if (!connectionId || !isValidUuid(connectionId) || !isValidUuid(resource.id)) {
        return;
      }

      const seq = ++requestSeqRef.current;
      setIsLoading(true);
      setActionError(null);

      try {
        const listPromise = listSpreadsheetTabs({
          workspaceId,
          connectionId,
          resourceId: resource.id,
          agentId: hasSavedAgent ? agentId : null,
        });

        const savedPromise = hasSavedAgent
          ? getAgentSheetTabs({
              workspaceId,
              agentId: agentId!,
              connectionId,
              resourceId: resource.id,
            })
          : Promise.resolve(null);

        const [listRes, savedRes] = await Promise.all([listPromise, savedPromise]);

        if (seq !== requestSeqRef.current) return;

        setSpreadsheetTitle(
          listRes.spreadsheet_title ||
            savedRes?.spreadsheet_title ||
            resource.name
        );
        setTabs(listRes.tabs);
        setHasLoadedTabs(true);

        if (savedRes) {
          // Never grant access to every tab by default; restore strictly what the backend saved for this agent
          const restoredIds = savedRes.selected_sheet_ids;
          setSavedSheetIds(restoredIds);
          if (!opts?.preserveDraft) {
            setDraftSheetIds(restoredIds);
          }
          setHasLoadedSavedConfig(true);
        } else {
          setSavedSheetIds([]);
          if (!opts?.preserveDraft) {
            setDraftSheetIds([]);
          }
          setHasLoadedSavedConfig(false);
        }
      } catch (err: unknown) {
        if (seq !== requestSeqRef.current) return;
        const classified = classifyGoogleSheetTabError(err, 'list');
        setActionError(classified);
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [workspaceId, agentId, hasSavedAgent, connectionId, resource.id, resource.name]
  );

  // Immediately clear prior agent/resource state whenever scope changes so another agent's
  // saved tab selection is never displayed for the currently open agent.
  useEffect(() => {
    requestSeqRef.current += 1;
    lastRefreshTriggerRef.current = refreshTrigger;
    setSpreadsheetTitle(resource.name);
    setTabs([]);
    setSavedSheetIds([]);
    setDraftSheetIds([]);
    setHasLoadedTabs(false);
    setHasLoadedSavedConfig(false);
    setActionError(null);

    void loadTabsAndSavedSelection();
  }, [
    workspaceId,
    agentId,
    connectionId,
    resource.id,
    resource.name,
    loadTabsAndSavedSelection,
  ]);

  // Triggered by the single top Refresh button to reload tabs and saved selections in place
  useEffect(() => {
    if (refreshTrigger === lastRefreshTriggerRef.current) return;
    lastRefreshTriggerRef.current = refreshTrigger;
    void loadTabsAndSavedSelection();
  }, [refreshTrigger, loadTabsAndSavedSelection]);

  const tabById = useMemo(() => {
    const map = new Map<number, GoogleSpreadsheetTab>();
    for (const tab of tabs) {
      map.set(tab.sheet_id, tab);
    }
    return map;
  }, [tabs]);

  // Identify any saved/draft IDs referencing tabs that were deleted or hidden in Google Sheets
  const staleSelectedIds = useMemo(() => {
    if (!hasLoadedTabs) return [];
    return draftSheetIds.filter((id) => {
      const match = tabById.get(id);
      return !match || match.hidden;
    });
  }, [hasLoadedTabs, draftSheetIds, tabById]);

  const isDirty = useMemo(
    () => !areSheetIdListsEqual(draftSheetIds, savedSheetIds),
    [draftSheetIds, savedSheetIds]
  );

  const toggleTab = (tab: GoogleSpreadsheetTab) => {
    if (!hasSavedAgent || isSaving || isLoading) return;
    const isCurrentlySelected = draftSheetIds.includes(tab.sheet_id);

    // Backend rejects hidden tabs on save; allow deselecting an already-selected hidden tab,
    // but block selecting a hidden tab.
    if (tab.hidden && !isCurrentlySelected) {
      return;
    }

    setActionError(null);
    setDraftSheetIds((prev) =>
      prev.includes(tab.sheet_id)
        ? prev.filter((id) => id !== tab.sheet_id)
        : [...prev, tab.sheet_id]
    );
  };

  const handleClearSelection = () => {
    if (!hasSavedAgent || isSaving || isLoading) return;
    setActionError(null);
    setDraftSheetIds([]);
  };

  const handleRemoveStaleIds = () => {
    if (!hasSavedAgent || isSaving || isLoading) return;
    setActionError(null);
    setDraftSheetIds((prev) =>
      prev.filter((id) => {
        const match = tabById.get(id);
        return Boolean(match && !match.hidden);
      })
    );
  };

  const handleSaveTabs = async () => {
    if (!hasSavedAgent || !agentId || !connectionId || isSaving) return;

    setIsSaving(true);
    setActionError(null);

    try {
      const numericIds = draftSheetIds.filter((id) => Number.isInteger(id));
      const result = await saveAgentSheetTabs({
        workspaceId,
        agentId,
        connectionId,
        resourceId: resource.id,
        selectedSheetIds: numericIds,
      });

      setSavedSheetIds(result.selected_sheet_ids);
      setDraftSheetIds(result.selected_sheet_ids);
      setHasLoadedSavedConfig(true);

      if (result.selected_sheet_ids.length === 0) {
        toast.success(
          `Cleared tab selection for "${spreadsheetTitle}" and disabled Sheets tools for this connection.`
        );
      } else {
        toast.success(
          `Saved ${result.selected_sheet_ids.length} ${
            result.selected_sheet_ids.length === 1 ? 'tab' : 'tabs'
          } for "${spreadsheetTitle}".`
        );
      }
    } catch (err: unknown) {
      const classified = classifyGoogleSheetTabError(err, 'save');
      setActionError(classified);
      toast.error(classified.message, { duration: 7000 });
    } finally {
      setIsSaving(false);
    }
  };

  const controlsDisabled =
    !hasSavedAgent || isLoading || isSaving || isBusyConnectingOrDisconnecting;

  return (
    <div className="pl-0 sm:pl-10 pt-2.5 border-t border-border/60">
      <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2.5">
        {/* Header: Spreadsheet title + selection summary */}
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Table2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[11px] font-semibold text-foreground truncate max-w-[260px] sm:max-w-[340px]">
              {spreadsheetTitle}
            </span>
            {hasSavedAgent && hasLoadedSavedConfig && (
              savedSheetIds.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="size-2.5" />
                  <span>
                    {savedSheetIds.length} saved
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  No tabs selected
                </span>
              )
            )}
            {isDirty && hasSavedAgent && (
              <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                Unsaved changes
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Choose which tabs this agent is configured to access in this spreadsheet.
          </p>
        </div>

        {/* Unsaved agent notice */}
        {!hasSavedAgent && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-200 leading-relaxed">
            Save this agent first to load and persist per-agent spreadsheet tab selections.
          </div>
        )}

        {/* Actionable Backend Error State */}
        {actionError && (
          <div
            className={`rounded-lg border px-2.5 py-2 flex flex-col sm:flex-row sm:items-start justify-between gap-2 ${
              actionError.category === 'expired_google_auth'
                ? 'border-amber-500/30 bg-amber-500/10'
                : 'border-red-500/25 bg-red-500/10'
            }`}
          >
            <div className="flex items-start gap-2 min-w-0">
              <AlertCircle
                className={`size-3.5 shrink-0 mt-0.5 ${
                  actionError.category === 'expired_google_auth'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              />
              <div className="space-y-0.5 min-w-0 text-[11px] leading-snug break-words">
                <p
                  className={`font-semibold ${
                    actionError.category === 'expired_google_auth'
                      ? 'text-amber-800 dark:text-amber-200'
                      : 'text-red-700 dark:text-red-300'
                  }`}
                >
                  {actionError.title}
                </p>
                <p
                  className={
                    actionError.category === 'expired_google_auth'
                      ? 'text-amber-800/90 dark:text-amber-200/90'
                      : 'text-red-700/90 dark:text-red-300/90'
                  }
                >
                  {actionError.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {actionError.reconnectRequired && (
                <button
                  type="button"
                  disabled={isBusyConnectingOrDisconnecting}
                  onClick={onReconnectSheets}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="size-3" />
                  <span>Reconnect Sheets</span>
                </button>
              )}
              {actionError.shouldRefreshTabs && (
                <button
                  type="button"
                  disabled={isLoading || isSaving}
                  onClick={() => void loadTabsAndSavedSelection()}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background hover:bg-accent px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`size-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Reload tabs</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActionError(null)}
                aria-label="Dismiss error"
                className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !hasLoadedTabs ? (
          <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />
            <span>Loading spreadsheet tabs…</span>
          </div>
        ) : hasLoadedTabs && tabs.length === 0 ? (
          <div className="rounded-lg border border-border bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
            No tabs were returned for this spreadsheet.
          </div>
        ) : hasLoadedTabs ? (
          <div className="space-y-2">
            {/* Warning if previously saved selection references a deleted or hidden tab */}
            {staleSelectedIds.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-amber-800 dark:text-amber-200">
                <span>
                  {staleSelectedIds.length} selected{' '}
                  {staleSelectedIds.length === 1 ? 'tab is' : 'tabs are'} now
                  deleted or hidden in Google Sheets. Remove unavailable tabs before saving.
                </span>
                {hasSavedAgent && (
                  <button
                    type="button"
                    onClick={handleRemoveStaleIds}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 text-[10px] font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                  >
                    <span>Remove unavailable</span>
                  </button>
                )}
              </div>
            )}

            {/* Tab checkboxes list */}
            <div className="flex flex-col gap-1.5">
              {tabs.map((tab) => {
                const isSelected = draftSheetIds.includes(tab.sheet_id);
                const isDisabled =
                  controlsDisabled || (tab.hidden && !isSelected);

                return (
                  <label
                    key={tab.sheet_id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-xs transition-colors ${
                      isSelected
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground'
                        : tab.hidden
                        ? 'border-border/60 bg-muted/40 text-muted-foreground'
                        : 'border-border bg-background/80 text-foreground hover:bg-accent/50'
                    } ${
                      isDisabled
                        ? 'opacity-65 cursor-not-allowed'
                        : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => toggleTab(tab)}
                        aria-label={`Select tab ${tab.title}`}
                        className="size-3.5 rounded border-border text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <span className="truncate font-medium text-[11px]">
                        {tab.title}
                      </span>
                    </div>

                    {tab.hidden && (
                      <span
                        title="Hidden tabs cannot be selected"
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border shrink-0"
                      >
                        <EyeOff className="size-2.5" />
                        <span>Hidden</span>
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {/* Clear no-tabs-selected state + Save/Clear controls */}
            {hasSavedAgent && (
              <div
                className={`flex flex-col sm:flex-row sm:items-center gap-2 pt-1.5 border-t border-border/60 ${
                  draftSheetIds.length === 0 ? 'justify-between' : 'justify-end'
                }`}
              >
                {draftSheetIds.length === 0 && (
                  <div className="text-[11px] text-muted-foreground">
                    <span>
                      No tabs selected. Saving an empty selection clears tab access and disables the four Sheets tools for this connection.
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {draftSheetIds.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      disabled={controlsDisabled}
                      className="rounded-lg border border-border bg-background hover:bg-accent px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Clear selection
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSaveTabs()}
                    disabled={controlsDisabled || !isDirty}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 text-[11px] font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <>
                        <Save className="size-3" />
                        <span>
                          {draftSheetIds.length === 0 && savedSheetIds.length > 0
                            ? 'Clear & Save'
                            : 'Save Tabs'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
