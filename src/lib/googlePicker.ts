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

export interface GooglePickerSelectedFile {
  id: string;
}

export interface GooglePickerOpenResult {
  cancelled: boolean;
  files: GooglePickerSelectedFile[];
}

export type GooglePickerInitialView = 'all' | 'documents' | 'spreadsheets';

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
  azp: string | null;
  projectNumber: string | null;
  expiresIn: number | null;
  skippedNetworkCheck?: boolean;
  error?: string;
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
  accessToken: string;
  expectedAccountEmail?: string | null;
  expectedAppId?: string | null;
}): Promise<VerifiedGooglePickerTokenInfo> {
  const token = normalizeCredentialValue(params.accessToken);
  if (!token) {
    return {
      valid: false,
      email: null,
      scope: null,
      hasDriveScope: false,
      azp: null,
      projectNumber: null,
      expiresIn: null,
      error: 'Missing Google access token from picker_token response.',
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
        azp: null,
        projectNumber: null,
        expiresIn: null,
        error: `Google Drive access token is invalid or expired (${desc}). Please reconnect Google Drive.`,
      };
    }

    const scopeStr = typeof data?.scope === 'string' ? data.scope.trim() : null;
    const scopeList = scopeStr ? scopeStr.split(/\s+/) : [];
    const hasDriveScope = scopeList.some(
      (s) =>
        s === 'https://www.googleapis.com/auth/drive.file' ||
        s === 'https://www.googleapis.com/auth/drive' ||
        s === 'https://www.googleapis.com/auth/drive.readonly'
    );

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
        azp,
        projectNumber,
        expiresIn,
        error: `Connected Google Drive account (${params.expectedAccountEmail}) does not match the token account (${tokenEmail}). Please reconnect Google Drive.`,
      };
    }

    if (scopeStr && !hasDriveScope) {
      return {
        valid: false,
        email: tokenEmail,
        scope: scopeStr,
        hasDriveScope: false,
        azp,
        projectNumber,
        expiresIn,
        error:
          'Google Drive OAuth token does not include Drive file permission (drive.file). Please reconnect Google Drive and approve Drive permissions.',
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
      azp,
      projectNumber,
      expiresIn,
    };
  } catch (err: any) {
    // Do not block Picker if corporate proxy / extension blocks oauth2.googleapis.com/tokeninfo
    console.warn('[Google Picker] Token preflight verification skipped:', {
      reason: err?.message || 'Network check unavailable',
    });
    return {
      valid: true,
      email: null,
      scope: null,
      hasDriveScope: true,
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

function configureBaseDocsView(view: any, googlePicker: any): any {
  if (typeof view.setIncludeFolders === 'function') {
    view.setIncludeFolders(true);
  }
  // Keep folder navigation interactive (open folders to pick files inside instead of selecting folders)
  if (typeof view.setSelectFolderEnabled === 'function') {
    view.setSelectFolderEnabled(false);
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
 * Opens the Google Picker modal configured with multi-file selection and proper tabs:
 * - My Drive (default for Drive): user's files and folders starting at root
 * - Recent / All Drive files: accessible files sorted by recency
 * - Shared with me: files shared with the connected account
 * - Starred: starred files in the connected account
 * - Shared drives: separate tab for organizational Shared Drives
 * When launched from Google Docs or Google Sheets, opens directly on Docs or Sheets view first.
 * Uses only the short-lived OAuth access token in memory and returns only selected file IDs.
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

  console.info('[Google Picker] Opening Picker modal:', {
    appId: validatedConfig.appId,
    hasClientId: Boolean(validatedConfig.clientId),
    hasApiKey: Boolean(validatedConfig.apiKey),
    origin: validatedConfig.origin,
    initialView: params.initialView || 'all',
  });

  return new Promise<GooglePickerOpenResult>((resolve, reject) => {
    let settled = false;

    try {
      // 1. My Drive — normal files & folders belonging to the connected account (default Drive view)
      const myDriveView = configureBaseDocsView(
        new googlePicker.DocsView(googlePicker.ViewId.DOCS),
        googlePicker
      );
      if (typeof myDriveView.setParent === 'function') {
        myDriveView.setParent('root');
      }

      // 2. Recent / All accessible Drive files (Docs, Sheets, PDFs, Images, Videos, ZIPs, etc.)
      const recentDriveView = configureBaseDocsView(
        new googlePicker.DocsView(googlePicker.ViewId.DOCS),
        googlePicker
      );

      // 3. Shared with me — files shared with the connected account
      const sharedWithMeView = configureBaseDocsView(
        new googlePicker.DocsView(googlePicker.ViewId.DOCS),
        googlePicker
      );
      if (typeof sharedWithMeView.setOwnedByMe === 'function') {
        sharedWithMeView.setOwnedByMe(false);
      }

      // 4. Starred — starred files
      const starredView = configureBaseDocsView(
        new googlePicker.DocsView(googlePicker.ViewId.DOCS),
        googlePicker
      );
      if (typeof starredView.setStarred === 'function') {
        starredView.setStarred(true);
      }

      // 5. Shared drives — dedicated separate view (MUST only be enabled on this view)
      const sharedDrivesView = configureBaseDocsView(
        new googlePicker.DocsView(googlePicker.ViewId.DOCS),
        googlePicker
      );
      if (typeof sharedDrivesView.setEnableDrives === 'function') {
        sharedDrivesView.setEnableDrives(true);
      }

      // Google Docs & Google Sheets focused views for Docs/Sheets card buttons
      const docsView = configureBaseDocsView(
        new googlePicker.DocsView(googlePicker.ViewId.DOCUMENTS),
        googlePicker
      );

      const sheetsView = configureBaseDocsView(
        new googlePicker.DocsView(googlePicker.ViewId.SPREADSHEETS),
        googlePicker
      );

      const orderedViews =
        params.initialView === 'documents'
          ? [
              docsView,
              myDriveView,
              sharedWithMeView,
              starredView,
              sharedDrivesView,
            ]
          : params.initialView === 'spreadsheets'
          ? [
              sheetsView,
              myDriveView,
              sharedWithMeView,
              starredView,
              sharedDrivesView,
            ]
          : [
              myDriveView,
              recentDriveView,
              sharedWithMeView,
              starredView,
              sharedDrivesView,
            ];

      const builder = new googlePicker.PickerBuilder()
        .setOAuthToken(accessToken)
        .setDeveloperKey(validatedConfig.apiKey)
        .setAppId(validatedConfig.appId)
        .enableFeature(googlePicker.Feature.MULTISELECT_ENABLED)
        .setTitle(
          params.initialView === 'documents'
            ? 'Select Google Docs for Zivofly'
            : params.initialView === 'spreadsheets'
            ? 'Select Google Sheets for Zivofly'
            : 'Select Google Drive files for Zivofly'
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
              const fileId = doc?.[googlePicker.Document.ID];
              return typeof fileId === 'string' && fileId.trim()
                ? { id: fileId.trim() }
                : null;
            })
            .filter(
              (
                item: GooglePickerSelectedFile | null
              ): item is GooglePickerSelectedFile => Boolean(item)
            );

          console.info('[Google Picker] Selected file IDs:', {
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
            action,
            error: data?.error || data,
            appId: validatedConfig.appId,
            origin: validatedConfig.origin,
          });
          if (!settled) {
            settled = true;
            reject(
              new Error(
                'Google Picker encountered an error while loading Drive files. Verify that Google Picker API is enabled in Google Cloud Console, the API key allows this site origin, and your Google Drive authorization is active.'
              )
            );
          }
        }
      });

      const picker = builder.build();
      picker.setVisible(true);
    } catch (err: any) {
      console.error('[Google Picker] Failed to initialize PickerBuilder:', {
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
