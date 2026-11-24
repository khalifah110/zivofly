import React, { useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  File,
  FileArchive,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  GoogleAuthorizedResource,
  GoogleResourceServiceKey,
  GoogleWorkspaceIntegrationStatus,
} from '../types';
import { GoogleDocsLogo, GoogleSheetsLogo } from './BrandLogos';
import { logGooglePickerConfigDiagnostic } from '../lib/googlePicker';
import { isGoogleScopeReauthError } from '../lib/supabaseService';

interface ServiceUiCopy {
  serviceLabel: string;
  sectionTitle: string;
  selectButtonLabel: string;
  subtitle?: string;
  disconnectedPrompt: string;
  connectButtonLabel: string;
  reconnectButtonLabel: string;
  expiredTitle: string;
  errorTitle: string;
  expiredDescription: string;
  loadingText: string;
  savingText: string;
  scopeReauthTitle: string;
}

const SERVICE_UI_COPY: Record<GoogleResourceServiceKey, ServiceUiCopy> = {
  google_drive: {
    serviceLabel: 'Google Drive',
    sectionTitle: 'Authorized Drive Files',
    selectButtonLabel: 'Add Drive File',
    subtitle:
      'Select uploaded Drive files (PDFs, images, CSV, Word, Excel, archives) or folders for this Google Drive connection. Native Google Docs and Sheets are managed separately.',
    disconnectedPrompt:
      'Connect your Google Drive account to browse and select Drive files, PDFs, images, CSVs, Word, and Excel documents.',
    connectButtonLabel: 'Connect Google Drive',
    reconnectButtonLabel: 'Reconnect Google Drive',
    expiredTitle: 'Google Drive authorization expired',
    errorTitle: 'Google Drive connection needs attention',
    expiredDescription:
      'Reconnect your Google Drive account to browse, verify, or authorize Drive files.',
    loadingText: 'Loading authorized Drive files…',
    savingText:
      'Verifying selected files with Google Drive and saving authorization…',
    scopeReauthTitle: 'Google Drive permissions update required',
  },
  google_docs: {
    serviceLabel: 'Google Docs',
    sectionTitle: 'Selected Google Docs',
    selectButtonLabel: 'Select Google Docs',
    disconnectedPrompt:
      'Connect Google Docs with read-only permissions to browse and select native Google Docs for your Knowledge Base.',
    connectButtonLabel: 'Connect Google Docs',
    reconnectButtonLabel: 'Reconnect Google Docs',
    expiredTitle: 'Google Docs authorization expired',
    errorTitle: 'Google Docs connection needs attention',
    expiredDescription:
      'Reconnect your Google Docs account to browse, verify, or authorize documents.',
    loadingText: 'Loading selected Google Docs…',
    savingText:
      'Verifying selected documents with Google Docs and saving authorization…',
    scopeReauthTitle: 'Google Docs read-only permissions update required',
  },
  google_sheets_service: {
    serviceLabel: 'Google Sheets',
    sectionTitle: 'Authorized Google Sheets',
    selectButtonLabel: 'Add Sheet',
    disconnectedPrompt:
      'Connect your Google Sheets account to browse and select native Google Sheets spreadsheets.',
    connectButtonLabel: 'Connect Google Sheets',
    reconnectButtonLabel: 'Reconnect Google Sheets',
    expiredTitle: 'Google Sheets authorization expired',
    errorTitle: 'Google Sheets connection needs attention',
    expiredDescription:
      'Reconnect your Google Sheets account to browse, verify, or authorize spreadsheets.',
    loadingText: 'Loading authorized Google Sheets…',
    savingText:
      'Verifying selected spreadsheets with Google Sheets and saving authorization…',
    scopeReauthTitle: 'Google Sheets permissions update required',
  },
};

interface AuthorizedResourcesSectionProps {
  service: GoogleResourceServiceKey;
  status: GoogleWorkspaceIntegrationStatus;
  resources: GoogleAuthorizedResource[];
  selectedCount?: number;
  activeCount: number;
  needsScopeReauth?: boolean;
  scopeReauthMessage?: string | null;
  isLoadingResources: boolean;
  isFetchingPickerToken: boolean;
  isPickerOpen: boolean;
  isSavingSelection: boolean;
  removingResourceId: string | null;
  resourcesError: string | null;
  isBusyConnectingOrDisconnecting?: boolean;
  pendingSyncBadgeLabel?: string;
  selectedAgentResourceIds?: string[];
  onToggleAgentResource?: (resourceId: string) => void;
  onSelectResources: () => void;
  onRequestRemoveResource: (resource: GoogleAuthorizedResource) => void;
  onRefreshResources: () => void;
  onConnectService: () => void;
  onClearError: () => void;
  renderResourceStatusBadge?: (resource: GoogleAuthorizedResource) => React.ReactNode;
  renderResourceExtra?: (resource: GoogleAuthorizedResource) => React.ReactNode;
}

export function renderResourceMimeIcon(mimeType: string) {
  const m = (mimeType || '').toLowerCase();
  if (m === 'application/vnd.google-apps.document') {
    return <GoogleDocsLogo className="size-4 shrink-0" />;
  }
  if (m === 'application/vnd.google-apps.spreadsheet') {
    return <GoogleSheetsLogo className="size-4 shrink-0" />;
  }
  if (m === 'application/vnd.google-apps.folder') {
    return <Folder className="size-4 text-amber-500 shrink-0" />;
  }
  if (m === 'application/pdf') {
    return <FileText className="size-4 text-red-500 shrink-0" />;
  }
  if (m.startsWith('image/')) {
    return <ImageIcon className="size-4 text-sky-500 shrink-0" />;
  }
  if (m.startsWith('video/')) {
    return <Film className="size-4 text-violet-500 shrink-0" />;
  }
  if (
    m === 'application/zip' ||
    m === 'application/x-zip-compressed' ||
    m === 'application/x-rar-compressed' ||
    m === 'application/x-7z-compressed' ||
    m === 'application/gzip'
  ) {
    return <FileArchive className="size-4 text-amber-600 shrink-0" />;
  }
  return <File className="size-4 text-muted-foreground shrink-0" />;
}

export function formatSelectionDate(dateIso?: string | null): string {
  if (!dateIso) return 'Unknown date';
  const parsed = new Date(dateIso);
  if (Number.isNaN(parsed.getTime())) return 'Unknown date';
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface RemoveGoogleResourceModalProps {
  resource: GoogleAuthorizedResource | null;
  service?: GoogleResourceServiceKey;
  isRemoving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const RemoveGoogleResourceModal: React.FC<RemoveGoogleResourceModalProps> = ({
  resource,
  service,
  isRemoving,
  onCancel,
  onConfirm,
}) => {
  useEffect(() => {
    if (!resource) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRemoving) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resource, isRemoving, onCancel]);

  if (!resource) return null;

  const effectiveService: GoogleResourceServiceKey =
    service || resource.service || 'google_drive';
  const serviceLabel = SERVICE_UI_COPY[effectiveService].serviceLabel;

  return (
    <div
      id="remove-google-resource-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={() => {
        if (!isRemoving) {
          onCancel();
        }
      }}
    >
      <div
        id="remove-google-resource-modal"
        className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden p-6 space-y-5 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-google-resource-title"
        aria-describedby="remove-google-resource-desc"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-card shrink-0">
              {renderResourceMimeIcon(resource.mime_type)}
            </div>
            <div className="min-w-0">
              <h3
                id="remove-google-resource-title"
                className="text-base font-semibold text-foreground"
              >
                Remove {serviceLabel} Authorization?
              </h3>
              <p className="text-xs text-muted-foreground truncate max-w-[260px]">
                {resource.name} ({resource.resource_type})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isRemoving}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/80 transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-3">
          <p
            id="remove-google-resource-desc"
            className="text-xs sm:text-sm text-muted-foreground leading-relaxed"
          >
            Removing{' '}
            <span className="font-semibold text-foreground">
              {resource.name}
            </span>{' '}
            revokes Zivofly&apos;s access to this resource for{' '}
            <span className="font-semibold text-foreground">{serviceLabel}</span>{' '}
            in your workspace.
          </p>

          <div className="rounded-xl border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground leading-relaxed">
            Your actual file in Google will not be deleted, and other connected Google services will remain unaffected.
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={isRemoving}
            className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-medium text-foreground hover:bg-accent/70 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRemoving}
            className="rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {isRemoving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Removing…</span>
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" />
                <span>Remove Authorization</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export const AuthorizedResourcesSection: React.FC<AuthorizedResourcesSectionProps> = ({
  service,
  status,
  resources,
  selectedCount: _selectedCount,
  activeCount,
  needsScopeReauth = false,
  scopeReauthMessage = null,
  isLoadingResources,
  isFetchingPickerToken,
  isPickerOpen,
  isSavingSelection,
  removingResourceId,
  resourcesError,
  isBusyConnectingOrDisconnecting = false,
  pendingSyncBadgeLabel,
  selectedAgentResourceIds,
  onToggleAgentResource,
  onSelectResources,
  onRequestRemoveResource,
  onRefreshResources,
  onConnectService,
  onClearError,
  renderResourceStatusBadge,
  renderResourceExtra,
}) => {
  const copy = SERVICE_UI_COPY[service];
  const pickerEnvStatus = logGooglePickerConfigDiagnostic();

  const isPickerActionBusy =
    isFetchingPickerToken ||
    isPickerOpen ||
    isSavingSelection ||
    Boolean(removingResourceId) ||
    isBusyConnectingOrDisconnecting;

  const pickerButtonLabel = isFetchingPickerToken
    ? 'Preparing Picker…'
    : isPickerOpen
    ? 'Selecting in Picker…'
    : isSavingSelection
    ? 'Saving Resources…'
    : copy.selectButtonLabel;

  const showErrorReconnect = Boolean(
    resourcesError && isGoogleScopeReauthError(resourcesError)
  );

  return (
    <div className="mt-3 pt-3 border-t border-border/80 space-y-3">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {copy.sectionTitle}
            </span>
            {status === 'connected' && service !== 'google_sheets_service' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border">
                {activeCount} Active
              </span>
            )}
          </div>
          {copy.subtitle && (
            <p className="text-[11px] text-muted-foreground">{copy.subtitle}</p>
          )}
        </div>

        {status === 'connected' && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefreshResources}
              disabled={isLoadingResources || isPickerActionBusy}
              title={
                service === 'google_docs'
                  ? 'Sync selected Google Docs'
                  : `Refresh authorized ${copy.serviceLabel} resources`
              }
              className="inline-flex items-center justify-center rounded-xl border border-border bg-background p-2 text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw
                className={`size-3.5 ${isLoadingResources ? 'animate-spin' : ''}`}
              />
            </button>
            {needsScopeReauth ? (
              <button
                type="button"
                onClick={onConnectService}
                disabled={isBusyConnectingOrDisconnecting}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <RefreshCw className="size-3.5" />
                <span>{copy.reconnectButtonLabel}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSelectResources}
                disabled={isPickerActionBusy}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isFetchingPickerToken || isPickerOpen || isSavingSelection ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                <span>{pickerButtonLabel}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Scope Reauthorization Prompt (isolated to this service only) */}
      {status === 'connected' && needsScopeReauth && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {copy.scopeReauthTitle}
              </p>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 leading-relaxed">
                {scopeReauthMessage ||
                  `Reconnect ${copy.serviceLabel} to grant the updated Google OAuth permissions required for independent resource selection. Other Google integrations will not be reset.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusyConnectingOrDisconnecting}
            onClick={onConnectService}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" />
            <span>{copy.reconnectButtonLabel}</span>
          </button>
        </div>
      )}

      {/* Frontend Picker Config Diagnostic Warning */}
      {status === 'connected' && pickerEnvStatus.configError && !resourcesError && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
            <p className="font-semibold">{pickerEnvStatus.configError}</p>
            <p>
              {pickerEnvStatus.isProd
                ? 'This production build was compiled without VITE_GOOGLE_PICKER_API_KEY. Ensure VITE_GOOGLE_PICKER_API_KEY and VITE_GOOGLE_CLIENT_ID are saved under Production environment variables (not Preview-only) and trigger a fresh Cloudflare Pages deployment so Vite injects them at build time.'
                : 'Add VITE_GOOGLE_PICKER_API_KEY and VITE_GOOGLE_CLIENT_ID to your .env file and restart the dev server.'}
            </p>
            <p className="text-[10px] opacity-85">
              Build check ({pickerEnvStatus.mode}): API Key {pickerEnvStatus.hasApiKey ? 'detected' : 'missing'} · Client ID {pickerEnvStatus.hasClientId ? 'detected' : 'missing'}
            </p>
          </div>
        </div>
      )}

      {/* Inline Error Banner */}
      {resourcesError && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed break-words">
              {resourcesError}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {showErrorReconnect && status === 'connected' && !needsScopeReauth && (
              <button
                type="button"
                disabled={isBusyConnectingOrDisconnecting}
                onClick={onConnectService}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className="size-3" />
                <span>{copy.reconnectButtonLabel}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClearError}
              className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* State A: Integration Not Connected */}
      {status === 'disconnected' && (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{copy.disconnectedPrompt}</p>
          <button
            type="button"
            disabled={isBusyConnectingOrDisconnecting}
            onClick={onConnectService}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer disabled:opacity-50"
          >
            <span>{copy.connectButtonLabel}</span>
          </button>
        </div>
      )}

      {/* State D: Authorization Expired / Error */}
      {(status === 'expired' || status === 'error') && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {status === 'expired' ? copy.expiredTitle : copy.errorTitle}
              </p>
              <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90">
                {copy.expiredDescription}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={isBusyConnectingOrDisconnecting}
            onClick={onConnectService}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" />
            <span>{copy.reconnectButtonLabel}</span>
          </button>
        </div>
      )}

      {/* Connected States: Loading / Saving / Selected Resources (when empty, only the top Select button appears) */}
      {status === 'connected' && (
        <>
          {isLoadingResources && resources.length === 0 ? (
            <div className="rounded-xl border border-border bg-muted/20 p-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{copy.loadingText}</span>
            </div>
          ) : isSavingSelection ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center justify-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
              <Loader2 className="size-4 animate-spin" />
              <span>{copy.savingText}</span>
            </div>
          ) : resources.length > 0 ? (
            /* State C: Resources Selected */
            <div className="space-y-2">
              <div className="divide-y divide-border rounded-xl border border-border bg-background/60 overflow-hidden">
                {resources.map((resource) => {
                  const isRemovingThis = removingResourceId === resource.id;
                  const isFolder =
                    resource.mime_type?.toLowerCase() ===
                    'application/vnd.google-apps.folder';
                  const isAssignedToAgent = selectedAgentResourceIds
                    ? selectedAgentResourceIds.includes(resource.id)
                    : true;

                  const extraContent = renderResourceExtra
                    ? renderResourceExtra(resource)
                    : null;

                  return (
                    <div
                      key={resource.id}
                      className="p-3 space-y-2.5 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                          {onToggleAgentResource && (
                            <input
                              type="checkbox"
                              checked={isAssignedToAgent}
                              onChange={() => onToggleAgentResource(resource.id)}
                              disabled={isPickerActionBusy}
                              aria-label={`Allow agent to access ${resource.name}`}
                              className="size-3.5 rounded border-border text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0 mt-1 sm:mt-0"
                            />
                          )}

                          <div className="flex size-8 items-center justify-center rounded-lg border border-border bg-card shrink-0">
                            {renderResourceMimeIcon(resource.mime_type)}
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-medium text-foreground truncate max-w-[260px] sm:max-w-[340px]">
                                {resource.name}
                              </span>
                              {service !== 'google_sheets_service' && (
                                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                                  {resource.resource_type}
                                </span>
                              )}
                              {renderResourceStatusBadge ? (
                                renderResourceStatusBadge(resource)
                              ) : resource.status === 'active' &&
                                service !== 'google_sheets_service' ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="size-2.5" />
                                  <span>Authorized</span>
                                </span>
                              ) : null}
                              {pendingSyncBadgeLabel && (
                                <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                                  <Clock className="size-2.5" />
                                  <span>{pendingSyncBadgeLabel}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                              <span>
                                Selected{' '}
                                {formatSelectionDate(
                                  resource.selected_at || resource.created_at
                                )}
                              </span>
                              {isFolder && (
                                <span className="text-amber-600 dark:text-amber-400">
                                  • Folder only (nested files require individual selection)
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                          {resource.web_view_link && (
                            <a
                              href={resource.web_view_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-accent transition-colors"
                            >
                              <span>Open</span>
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            disabled={isPickerActionBusy}
                            onClick={() => onRequestRemoveResource(resource)}
                            className="inline-flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isRemovingThis ? (
                              <>
                                <Loader2 className="size-3 animate-spin" />
                                <span>Removing…</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="size-3" />
                                <span>Remove</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {extraContent}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};
