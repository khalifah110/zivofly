/**
 * Official Google Picker API loader, credential validator, token verifier, & modal launcher.
 * Loads https://apis.google.com/js/api.js safely once and initializes
 * google.picker with a short-lived access token retrieved from Supabase Edge Function `google_workspace`.
 */

declare global {
  interface Window {
    gapi?: {
      load: (
        libraries: string,
        options:
          | (() => void)
          | {
              callback?: () => void;
              onerror?: () => void;
              timeout?: number;
              ontimeout?: () => void;
            }
      ) => void;
    };
    google?: {
      picker?: any;
    };
  }
}

import { GoogleResourceServiceKey } from '../types';

export const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';
export const GOOGLE_SHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
export const GOOGLE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export interface GooglePickerSelectedFile {
  id: string;
  mimeType?: string | null;
  name?: string | null;
}

export interface GooglePickerOpenResult {
  cancelled: boolean;
  files: GooglePickerSelectedFile[];
}

export type GooglePickerInitialView =
  | 'drive'
  | 'all'
  | 'documents'
  | 'spreadsheets';

export interface GooglePickerConfig {
  apiKey: string | null;
  clientId: string | null;
  appId: string | null;
  origin: string | null;
}

export interface GooglePickerFrontendEnvStatus {
  mode: string;
  isProd: boolean;
  hasApiKey: boolean;
  hasClientId: boolean;
  hasAppId: boolean;
  configError: string | null;
}

export interface VerifiedGooglePickerTokenInfo {
  valid: boolean;
  email: string | null;
  scope: string | null;
  hasDriveScope: boolean;
  hasDocumentsScope: boolean;
  hasSpreadsheetsScope: boolean;
  missingScopes: string[];
  needsReconnect?: boolean;
  azp: string | null;
  projectNumber: string | null;
  expiresIn: number | null;
  skippedNetworkCheck?: boolean;
  error?: string;
}

export interface PickerFileFilterResult {
  validFiles: GooglePickerSelectedFile[];
  rejectedFiles: Array<GooglePickerSelectedFile & { reason: string }>;
  rejectionMessage: string | null;
}

function getGoogleServiceLabel(service: GoogleResourceServiceKey): string {
  if (service === 'google_docs') return 'Google Docs';
  if (service === 'google_sheets_service') return 'Google Sheets';
  return 'Google Drive';
}

function formatRejectedFileNames(
  files: Array<GooglePickerSelectedFile>
): string {
  const names = files
    .map((f) => (typeof f.name === 'string' && f.name.trim() ? f.name.trim() : f.id))
    .slice(0, 3);
  const extra = files.length - names.length;
  if (names.length === 0) return '';
  return extra > 0 ? `${names.join(', ')} (+${extra} more)` : names.join(', ');
}

/**
 * Enforces strict service-level file rules on items returned by Google Picker
 * before any file ID is sent to `google_workspace` (`save_selected_resources`):
 * - Google Drive: rejects native Google Docs and native Google Sheets.
 * - Google Docs: rejects any non-native Google Docs files.
 * - Google Sheets: rejects any non-native Google Sheets files.
 * The backend independently verifies real Google metadata for all file IDs.
 */
export function filterAndValidatePickerFiles(
  service: GoogleResourceServiceKey,
  files: GooglePickerSelectedFile[]
): PickerFileFilterResult {
  const validFiles: GooglePickerSelectedFile[] = [];
  const rejectedFiles: Array<GooglePickerSelectedFile & { reason: string }> = [];

  for (const file of files || []) {
    const id = typeof file?.id === 'string' ? file.id.trim() : '';
    if (!id) continue;

    const mime =
      typeof file.mimeType === 'string' ? file.mimeType.trim().toLowerCase() : '';

    if (service === 'google_drive') {
      if (mime === GOOGLE_DOC_MIME_TYPE || mime === GOOGLE_SHEET_MIME_TYPE) {
        rejectedFiles.push({
          ...file,
          id,
          reason:
            mime === GOOGLE_DOC_MIME_TYPE
              ? 'Native Google Docs must be selected from Google Docs.'
              : 'Native Google Sheets must be selected from Google Sheets.',
        });
        continue;
      }
      validFiles.push({ ...file, id });
      continue;
    }

    if (service === 'google_docs') {
      if (mime && mime !== GOOGLE_DOC_MIME_TYPE) {
        rejectedFiles.push({
          ...file,
          id,
          reason: 'Only native Google Docs documents can be selected in Google Docs.',
        });
        continue;
      }
      validFiles.push({ ...file, id });
      continue;
    }

    if (service === 'google_sheets_service') {
      if (mime && mime !== GOOGLE_SHEET_MIME_TYPE) {
        rejectedFiles.push({
          ...file,
          id,
          reason:
            'Only native Google Sheets spreadsheets can be selected in Google Sheets.',
        });
        continue;
      }
      validFiles.push({ ...file, id });
      continue;
    }
  }

  let rejectionMessage: string | null = null;
  if (rejectedFiles.length > 0) {
    const names = formatRejectedFileNames(rejectedFiles);
    if (service === 'google_drive') {
      rejectionMessage = `Native Google Docs and Google Sheets cannot be selected in Google Drive (${names}). Please select them from the Google Docs or Google Sheets cards instead.`;
    } else if (service === 'google_docs') {
      rejectionMessage = `Only native Google Docs documents can be selected in Google Docs (${names} rejected).`;
    } else {
      rejectionMessage = `Only native Google Sheets spreadsheets can be selected in Google Sheets (${names} rejected).`;
    }
  }

  return {
    validFiles,
    rejectedFiles,
    rejectionMessage,
  };
}

const GAPI_SCRIPT_SRC = 'https://apis.google.com/js/api.js';
let pickerLoaderPromise: Promise<void> | null = null;
let hasLoggedConfigDiagnostic = false;

/**
 * Normalizes environment or backend string values without silently converting missing values to `""`.
 */
function normalizeCredentialValue(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (
    lower === 'undefined' ||
    lower === 'null' ||
    lower.startsWith('your_') ||
    lower.startsWith('my_')
  ) {
    return null;
  }
  return trimmed;
}

function looksLikeOAuthClientId(val: string): boolean {
  return /\.apps\.googleusercontent\.com$/i.test(val) || /^\d+-[a-z0-9_]+$/i.test(val);
}

function looksLikeApiKey(val: string): boolean {
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(val);
}

/**
 * Extracts the numeric Google Cloud project number from an explicit App ID or OAuth Client ID.
 */
export function extractGoogleProjectNumber(
  clientId?: string | null,
  explicitAppId?: string | null
): string | null {
  const normalizedAppId = normalizeCredentialValue(explicitAppId);
  if (normalizedAppId && /^\d+$/.test(normalizedAppId)) {
    return normalizedAppId;
  }

  const normalizedClientId = normalizeCredentialValue(clientId);
  if (normalizedClientId && normalizedClientId.includes('-')) {
    const prefix = normalizedClientId.split('-')[0].trim();
    if (/^\d+$/.test(prefix)) {
      return prefix;
    }
  }

  return null;
}

/**
 * Reads frontend Google Picker credentials strictly from Vite environment variables:
 * - `VITE_GOOGLE_PICKER_API_KEY` for the Picker API key
 * - `VITE_GOOGLE_CLIENT_ID` for the Google OAuth Client ID
 * - `VITE_GOOGLE_APP_ID` (optional explicit Google Cloud project number)
 */
export function resolveGooglePickerConfig(overrides?: {
  apiKey?: string | null;
  clientId?: string | null;
  appId?: string | null;
}): GooglePickerConfig {
  const envApiKey = normalizeCredentialValue(
    import.meta.env.VITE_GOOGLE_PICKER_API_KEY
  );
  const envClientId = normalizeCredentialValue(
    import.meta.env.VITE_GOOGLE_CLIENT_ID
  );
  const envAppId = normalizeCredentialValue(
    import.meta.env.VITE_GOOGLE_APP_ID
  );

  const apiKey = envApiKey ?? normalizeCredentialValue(overrides?.apiKey);
  const clientId = envClientId ?? normalizeCredentialValue(overrides?.clientId);
  const explicitAppId =
    envAppId ?? normalizeCredentialValue(overrides?.appId);

  const appId = extractGoogleProjectNumber(clientId, explicitAppId);
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : typeof window !== 'undefined' &&
        window.location?.protocol &&
        window.location?.host
      ? `${window.location.protocol}//${window.location.host}`
      : null;

  return {
    apiKey,
    clientId,
    appId,
    origin,
  };
}

/**
 * Checks whether required frontend environment credentials exist in the compiled Vite build
 * without exposing or logging any credential values.
 */
export function getFrontendGooglePickerConfigStatus(): GooglePickerFrontendEnvStatus {
  const config = resolveGooglePickerConfig();
  const mode =
    typeof import.meta.env.MODE === 'string'
      ? import.meta.env.MODE
      : 'unknown';
  const isProd = Boolean(import.meta.env.PROD);

  let configError: string | null = null;
  if (!config.apiKey) {
    configError =
      'Google Picker API key is not configured (VITE_GOOGLE_PICKER_API_KEY).';
  } else if (looksLikeOAuthClientId(config.apiKey)) {
    configError =
      'Invalid configuration: VITE_GOOGLE_PICKER_API_KEY contains a Google OAuth Client ID instead of a Google Picker API key.';
  } else if (config.clientId && looksLikeApiKey(config.clientId)) {
    configError =
      'Invalid configuration: VITE_GOOGLE_CLIENT_ID contains a Google API key instead of an OAuth Client ID.';
  }

  return {
    mode,
    isProd,
    hasApiKey: Boolean(config.apiKey),
    hasClientId: Boolean(config.clientId),
    hasAppId: Boolean(config.appId),
    configError,
  };
}

/**
 * Logs a safe one-time boolean diagnostic indicating whether Vite baked
 * VITE_GOOGLE_PICKER_API_KEY and VITE_GOOGLE_CLIENT_ID into the current build.
 * Never logs actual key or token values.
 */
export function logGooglePickerConfigDiagnostic(): GooglePickerFrontendEnvStatus {
  const status = getFrontendGooglePickerConfigStatus();
  if (!hasLoggedConfigDiagnostic) {
    hasLoggedConfigDiagnostic = true;
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : null;
    console.info('[Google Picker] Build configuration check:', {
      mode: status.mode,
      isProd: status.isProd,
      hasPickerApiKey: status.hasApiKey,
      hasClientId: status.hasClientId,
      hasAppId: status.hasAppId,
      origin,
    });
  }
  return status;
}

/**
 * Validates that the Picker API key and Google Cloud Project Number (`appId`) are valid and not swapped.
 */
export function validateGooglePickerConfig(
  config: GooglePickerConfig
): { apiKey: string; clientId: string | null; appId: string; origin: string | null } {
  if (!config.apiKey) {
    throw new Error(
      'Google Picker API key is not configured (VITE_GOOGLE_PICKER_API_KEY).'
    );
  }

  if (looksLikeOAuthClientId(config.apiKey)) {
    throw new Error(
      'Configuration mismatch: VITE_GOOGLE_PICKER_API_KEY appears to be an OAuth Client ID (*.apps.googleusercontent.com). Set VITE_GOOGLE_PICKER_API_KEY to your Google Picker API key.'
    );
  }

  if (config.clientId && looksLikeApiKey(config.clientId)) {
    throw new Error(
      'Configuration mismatch: VITE_GOOGLE_CLIENT_ID appears to be an API key (AIza...). Set VITE_GOOGLE_CLIENT_ID to your Google OAuth Client ID.'
    );
  }

  if (!config.appId || !/^\d+$/.test(config.appId)) {
    throw new Error(
      'Google Cloud project number (appId) is missing or invalid. Set VITE_GOOGLE_CLIENT_ID (or VITE_GOOGLE_APP_ID) in your frontend configuration.'
    );
  }

  return {
    apiKey: config.apiKey,
    clientId: config.clientId,
    appId: config.appId,
    origin: config.origin,
  };
}

/**
 * Verifies the short-lived access token returned by `google_workspace` (`picker_token`)
 * via Google's tokeninfo endpoint (sent via POST body so the token never appears in URLs or logs).
 */
export async function verifyGooglePickerAccessToken(params: {
  service?: GoogleResourceServiceKey;
  accessToken: string;
  expectedAccountEmail?: string | null;
  expectedAppId?: string | null;
}): Promise<VerifiedGooglePickerTokenInfo> {
  const service: GoogleResourceServiceKey = params.service || 'google_drive';
  const serviceLabel = getGoogleServiceLabel(service);
  const token = normalizeCredentialValue(params.accessToken);
  if (!token) {
    return {
      valid: false,
      email: null,
      scope: null,
      hasDriveScope: false,
      hasDocumentsScope: false,
      hasSpreadsheetsScope: false,
      missingScopes: [],
      azp: null,
      projectNumber: null,
      expiresIn: null,
      error: `Missing Google access token from ${serviceLabel} picker_token response.`,
    };
  }

  try {
    const resp = await fetch('https://oauth2.googleapis.com/tokeninfo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ access_token: token }).toString(),
    });

    const data: any = await resp.json().catch(() => null);

    if (!resp.ok || data?.error) {
      const desc =
        data?.error_description ||
        data?.error ||
        `HTTP ${resp.status}`;
      return {
        valid: false,
        email: null,
        scope: null,
        hasDriveScope: false,
        hasDocumentsScope: false,
        hasSpreadsheetsScope: false,
        missingScopes: [],
        needsReconnect: true,
        azp: null,
        projectNumber: null,
        expiresIn: null,
        error: `${serviceLabel} access token is invalid or expired (${desc}). Please reconnect ${serviceLabel}.`,
      };
    }

    const scopeStr = typeof data?.scope === 'string' ? data.scope.trim() : null;
    const scopeList = scopeStr ? scopeStr.split(/\s+/) : [];
    const hasDriveScope = scopeList.some(
      (s) =>
        s === 'https://www.googleapis.com/auth/drive.file' ||
        s === 'https://www.googleapis.com/auth/drive'
    );
    const hasDocumentsScope = scopeList.some(
      (s) => s === 'https://www.googleapis.com/auth/documents'
    );
    const hasSpreadsheetsScope = scopeList.some(
      (s) => s === 'https://www.googleapis.com/auth/spreadsheets'
    );

    const missingScopes: string[] = [];
    if (scopeStr) {
      if (!hasDriveScope) {
        missingScopes.push('drive.file');
      }
      if (service === 'google_docs' && !hasDocumentsScope) {
        missingScopes.push('documents');
      }
      if (service === 'google_sheets_service' && !hasSpreadsheetsScope) {
        missingScopes.push('spreadsheets');
      }
    }

    const azp = typeof data?.azp === 'string' ? data.azp.trim() : null;
    const projectNumber = extractGoogleProjectNumber(azp, null);
    const tokenEmail =
      typeof data?.email === 'string' && data.email.trim()
        ? data.email.trim()
        : null;
    const expiresInRaw = Number(data?.expires_in);
    const expiresIn = Number.isFinite(expiresInRaw) ? expiresInRaw : null;

    if (
      params.expectedAccountEmail &&
      tokenEmail &&
      params.expectedAccountEmail.trim().toLowerCase() !==
        tokenEmail.toLowerCase()
    ) {
      return {
        valid: false,
        email: tokenEmail,
        scope: scopeStr,
        hasDriveScope,
        hasDocumentsScope,
        hasSpreadsheetsScope,
        missingScopes,
        needsReconnect: true,
        azp,
        projectNumber,
        expiresIn,
        error: `Connected ${serviceLabel} account (${params.expectedAccountEmail}) does not match the token account (${tokenEmail}). Please reconnect ${serviceLabel}.`,
      };
    }

    if (scopeStr && missingScopes.length > 0) {
      return {
        valid: false,
        email: tokenEmail,
        scope: scopeStr,
        hasDriveScope,
        hasDocumentsScope,
        hasSpreadsheetsScope,
        missingScopes,
        needsReconnect: true,
        azp,
        projectNumber,
        expiresIn,
        error: `${serviceLabel} is missing required OAuth permission(s): ${missingScopes.join(
          ', '
        )}. Please reconnect ${serviceLabel} to grant updated access.`,
      };
    }

    if (
      params.expectedAppId &&
      projectNumber &&
      params.expectedAppId !== projectNumber
    ) {
      console.warn(
        '[Google Picker] Project number mismatch between configured VITE_GOOGLE_CLIENT_ID and picker_token OAuth client:',
        {
          service,
          configuredAppId: params.expectedAppId,
          tokenProjectNumber: projectNumber,
        }
      );
    }

    return {
      valid: true,
      email: tokenEmail,
      scope: scopeStr,
      hasDriveScope,
      hasDocumentsScope,
      hasSpreadsheetsScope,
      missingScopes: [],
      azp,
      projectNumber,
      expiresIn,
    };
  } catch (err: any) {
    // Do not block Picker if corporate proxy / extension blocks oauth2.googleapis.com/tokeninfo
    console.warn('[Google Picker] Token preflight verification skipped:', {
      service,
      reason: err?.message || 'Network check unavailable',
    });
    return {
      valid: true,
      email: null,
      scope: null,
      hasDriveScope: true,
      hasDocumentsScope: service !== 'google_docs' ? false : true,
      hasSpreadsheetsScope: service !== 'google_sheets_service' ? false : true,
      missingScopes: [],
      azp: null,
      projectNumber: null,
      expiresIn: null,
      skippedNetworkCheck: true,
    };
  }
}

/**
 * Safely loads the official Google API script (`apis.google.com/js/api.js`)
 * and initializes the `picker` library once per browser session.
 */
export function loadGooglePickerApi(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Picker can only run in a browser.'));
  }

  if (
    window.google?.picker?.PickerBuilder &&
    window.google?.picker?.DocsView
  ) {
    return Promise.resolve();
  }

  if (pickerLoaderPromise) {
    return pickerLoaderPromise;
  }

  pickerLoaderPromise = new Promise<void>((resolve, reject) => {
    const loadPickerModule = () => {
      if (
        window.google?.picker?.PickerBuilder &&
        window.google?.picker?.DocsView
      ) {
        resolve();
        return;
      }

      if (!window.gapi || typeof window.gapi.load !== 'function') {
        pickerLoaderPromise = null;
        reject(new Error('Google API client (gapi) failed to initialize.'));
        return;
      }

      window.gapi.load('picker', {
        callback: () => {
          if (
            window.google?.picker?.PickerBuilder &&
            window.google?.picker?.DocsView
          ) {
            resolve();
          } else {
            pickerLoaderPromise = null;
            reject(
              new Error(
                'Google Picker library loaded without PickerBuilder/DocsView.'
              )
            );
          }
        },
        onerror: () => {
          pickerLoaderPromise = null;
          reject(new Error('Failed to load Google Picker module from gapi.'));
        },
        timeout: 15000,
        ontimeout: () => {
          pickerLoaderPromise = null;
          reject(new Error('Timed out while loading Google Picker API.'));
        },
      });
    };

    if (window.gapi && typeof window.gapi.load === 'function') {
      loadPickerModule();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${GAPI_SCRIPT_SRC}"]`
    );

    if (existingScript) {
      if (existingScript.dataset.loaded === 'true') {
        loadPickerModule();
        return;
      }
      existingScript.addEventListener('load', () => {
        existingScript.dataset.loaded = 'true';
        loadPickerModule();
      });
      existingScript.addEventListener('error', () => {
        pickerLoaderPromise = null;
        reject(
          new Error(
            'Could not load Google Picker script. Check your network connection or content blockers.'
          )
        );
      });
      return;
    }

    const script = document.createElement('script');
    script.src = GAPI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = 'true';
      loadPickerModule();
    };
    script.onerror = () => {
      pickerLoaderPromise = null;
      script.remove();
      reject(
        new Error(
          'Failed to load the Google Picker script (https://apis.google.com/js/api.js).'
        )
      );
    };
    document.head.appendChild(script);
  });

  return pickerLoaderPromise;
}

function configureBaseDocsView(
  view: any,
  googlePicker: any,
  options?: {
    includeFolders?: boolean;
    mimeTypes?: string;
  }
): any {
  const includeFolders = options?.includeFolders ?? true;
  if (typeof view.setIncludeFolders === 'function') {
    view.setIncludeFolders(includeFolders);
  }
  // Keep folder navigation interactive (open folders to pick files inside instead of selecting folders)
  if (typeof view.setSelectFolderEnabled === 'function') {
    view.setSelectFolderEnabled(false);
  }
  if (options?.mimeTypes && typeof view.setMimeTypes === 'function') {
    view.setMimeTypes(options.mimeTypes);
  }
  if (
    googlePicker?.DocsViewMode?.LIST &&
    typeof view.setMode === 'function'
  ) {
    view.setMode(googlePicker.DocsViewMode.LIST);
  }
  return view;
}

/**
 * Opens an isolated Google Picker modal strictly configured for the target service:
 * - `'drive'` / `'all'`: Drive files & folders across My Drive, Recent, Shared with me, Starred, and Shared drives.
 *   (Native Google Docs & Sheets are rejected before saving.)
 * - `'documents'`: Native Google Docs only (`application/vnd.google-apps.document`) across Docs, My Drive, Shared with me, Starred, and Shared drives.
 * - `'spreadsheets'`: Native Google Sheets only (`application/vnd.google-apps.spreadsheet`) across Sheets, My Drive, Shared with me, Starred, and Shared drives.
 * Uses only the short-lived OAuth access token in memory for that specific connection ID.
 */
export async function openGooglePicker(params: {
  accessToken: string;
  apiKey?: string | null;
  clientId?: string | null;
  appId?: string | null;
  initialView?: GooglePickerInitialView;
}): Promise<GooglePickerOpenResult> {
  const accessToken = normalizeCredentialValue(params.accessToken);
  if (!accessToken) {
    throw new Error(
      'A short-lived Google access token is required to open Google Picker.'
    );
  }

  const rawConfig = resolveGooglePickerConfig({
    apiKey: params.apiKey,
    clientId: params.clientId,
    appId: params.appId,
  });

  const validatedConfig = validateGooglePickerConfig(rawConfig);

  await loadGooglePickerApi();

  const googlePicker = window.google?.picker;
  if (!googlePicker?.PickerBuilder || !googlePicker?.DocsView) {
    throw new Error(
      'Google Picker API failed to become ready in this browser session.'
    );
  }

  const mode: 'drive' | 'documents' | 'spreadsheets' =
    params.initialView === 'documents'
      ? 'documents'
      : params.initialView === 'spreadsheets'
      ? 'spreadsheets'
      : 'drive';

  console.info('[Google Picker] Opening Picker modal:', {
    appId: validatedConfig.appId,
    hasClientId: Boolean(validatedConfig.clientId),
    hasApiKey: Boolean(validatedConfig.apiKey),
    origin: validatedConfig.origin,
    mode,
  });

  return new Promise<GooglePickerOpenResult>((resolve, reject) => {
    let settled = false;

    try {
      let orderedViews: any[] = [];

      if (mode === 'documents') {
        // Strictly native Google Docs across every tab
        const docsPrimaryView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCUMENTS),
          googlePicker,
          { includeFolders: false, mimeTypes: GOOGLE_DOC_MIME_TYPE }
        );

        const docsMyDriveView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true, mimeTypes: GOOGLE_DOC_MIME_TYPE }
        );
        if (typeof docsMyDriveView.setParent === 'function') {
          docsMyDriveView.setParent('root');
        }

        const docsSharedWithMeView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true, mimeTypes: GOOGLE_DOC_MIME_TYPE }
        );
        if (typeof docsSharedWithMeView.setOwnedByMe === 'function') {
          docsSharedWithMeView.setOwnedByMe(false);
        }

        const docsStarredView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: false, mimeTypes: GOOGLE_DOC_MIME_TYPE }
        );
        if (typeof docsStarredView.setStarred === 'function') {
          docsStarredView.setStarred(true);
        }

        const docsSharedDrivesView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true, mimeTypes: GOOGLE_DOC_MIME_TYPE }
        );
        if (typeof docsSharedDrivesView.setEnableDrives === 'function') {
          docsSharedDrivesView.setEnableDrives(true);
        }

        orderedViews = [
          docsPrimaryView,
          docsMyDriveView,
          docsSharedWithMeView,
          docsStarredView,
          docsSharedDrivesView,
        ];
      } else if (mode === 'spreadsheets') {
        // Strictly native Google Sheets across every tab
        const sheetsPrimaryView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.SPREADSHEETS),
          googlePicker,
          { includeFolders: false, mimeTypes: GOOGLE_SHEET_MIME_TYPE }
        );

        const sheetsMyDriveView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true, mimeTypes: GOOGLE_SHEET_MIME_TYPE }
        );
        if (typeof sheetsMyDriveView.setParent === 'function') {
          sheetsMyDriveView.setParent('root');
        }

        const sheetsSharedWithMeView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true, mimeTypes: GOOGLE_SHEET_MIME_TYPE }
        );
        if (typeof sheetsSharedWithMeView.setOwnedByMe === 'function') {
          sheetsSharedWithMeView.setOwnedByMe(false);
        }

        const sheetsStarredView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: false, mimeTypes: GOOGLE_SHEET_MIME_TYPE }
        );
        if (typeof sheetsStarredView.setStarred === 'function') {
          sheetsStarredView.setStarred(true);
        }

        const sheetsSharedDrivesView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true, mimeTypes: GOOGLE_SHEET_MIME_TYPE }
        );
        if (typeof sheetsSharedDrivesView.setEnableDrives === 'function') {
          sheetsSharedDrivesView.setEnableDrives(true);
        }

        orderedViews = [
          sheetsPrimaryView,
          sheetsMyDriveView,
          sheetsSharedWithMeView,
          sheetsStarredView,
          sheetsSharedDrivesView,
        ];
      } else {
        // Google Drive mode — My Drive, Recent, Shared with me, Starred, and Shared drives
        const myDriveView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true }
        );
        if (typeof myDriveView.setParent === 'function') {
          myDriveView.setParent('root');
        }

        const recentDriveView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true }
        );

        const sharedWithMeView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true }
        );
        if (typeof sharedWithMeView.setOwnedByMe === 'function') {
          sharedWithMeView.setOwnedByMe(false);
        }

        const starredView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true }
        );
        if (typeof starredView.setStarred === 'function') {
          starredView.setStarred(true);
        }

        const sharedDrivesView = configureBaseDocsView(
          new googlePicker.DocsView(googlePicker.ViewId.DOCS),
          googlePicker,
          { includeFolders: true }
        );
        if (typeof sharedDrivesView.setEnableDrives === 'function') {
          sharedDrivesView.setEnableDrives(true);
        }

        orderedViews = [
          myDriveView,
          recentDriveView,
          sharedWithMeView,
          starredView,
          sharedDrivesView,
        ];
      }

      const builder = new googlePicker.PickerBuilder()
        .setOAuthToken(accessToken)
        .setDeveloperKey(validatedConfig.apiKey)
        .setAppId(validatedConfig.appId)
        .enableFeature(googlePicker.Feature.MULTISELECT_ENABLED)
        .setTitle(
          mode === 'documents'
            ? 'Select Google Docs for Zivofly'
            : mode === 'spreadsheets'
            ? 'Select Google Sheets for Zivofly'
            : 'Select Drive Files for Zivofly'
        );

      if (googlePicker.Feature?.SUPPORT_DRIVES) {
        builder.enableFeature(googlePicker.Feature.SUPPORT_DRIVES);
      }

      if (validatedConfig.origin) {
        builder.setOrigin(validatedConfig.origin);
      }

      for (const view of orderedViews) {
        builder.addView(view);
      }

      builder.setCallback((data: any) => {
        const action = data?.[googlePicker.Response.ACTION];

        if (action === googlePicker.Action.LOADED) {
          console.info('[Google Picker] Picker modal loaded successfully.');
          return;
        }

        if (action === googlePicker.Action.CANCEL) {
          if (!settled) {
            settled = true;
            resolve({ cancelled: true, files: [] });
          }
          return;
        }

        if (action === googlePicker.Action.PICKED) {
          const rawDocs = Array.isArray(data?.[googlePicker.Response.DOCUMENTS])
            ? data[googlePicker.Response.DOCUMENTS]
            : [];

          const files: GooglePickerSelectedFile[] = rawDocs
            .map((doc: any) => {
              const fileId = doc?.[googlePicker.Document.ID] ?? doc?.id;
              if (typeof fileId !== 'string' || !fileId.trim()) return null;
              const mimeRaw =
                doc?.[googlePicker.Document.MIME_TYPE] ?? doc?.mimeType;
              const nameRaw = doc?.[googlePicker.Document.NAME] ?? doc?.name;
              return {
                id: fileId.trim(),
                mimeType:
                  typeof mimeRaw === 'string' && mimeRaw.trim()
                    ? mimeRaw.trim()
                    : null,
                name:
                  typeof nameRaw === 'string' && nameRaw.trim()
                    ? nameRaw.trim()
                    : null,
              };
            })
            .filter(
              (
                item: GooglePickerSelectedFile | null
              ): item is GooglePickerSelectedFile => Boolean(item)
            );

          console.info('[Google Picker] Picked items:', {
            mode,
            count: files.length,
          });

          if (!settled) {
            settled = true;
            resolve({
              cancelled: false,
              files,
            });
          }
          return;
        }

        if (
          (googlePicker.Action?.ERROR && action === googlePicker.Action.ERROR) ||
          data?.error
        ) {
          console.error('[Google Picker] Picker callback error:', {
            mode,
            action,
            error: data?.error || data,
            appId: validatedConfig.appId,
            origin: validatedConfig.origin,
          });
          if (!settled) {
            settled = true;
            reject(
              new Error(
                'Google Picker encountered an error while loading files. Verify that Google Picker API is enabled in Google Cloud Console, the API key allows this site origin, and your Google authorization is active.'
              )
            );
          }
        }
      });

      const picker = builder.build();
      picker.setVisible(true);
    } catch (err: any) {
      console.error('[Google Picker] Failed to initialize PickerBuilder:', {
        mode,
        message: err?.message,
        appId: validatedConfig.appId,
        origin: validatedConfig.origin,
      });
      if (!settled) {
        settled = true;
        reject(
          new Error(
            err?.message || 'Could not initialize the Google Picker modal.'
          )
        );
      }
    }
  });
}
