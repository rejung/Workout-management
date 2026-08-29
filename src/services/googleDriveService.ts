/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  Auth,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize firebase app if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth: Auth = getAuth(app);

// Explicit Firebase Auth browser local persistence
let persistenceInitPromise: Promise<void> | null = null;
export const ensureAuthPersistence = async (): Promise<void> => {
  if (!persistenceInitPromise) {
    persistenceInitPromise = setPersistence(auth, browserLocalPersistence).catch((err) => {
      console.warn('Firebase setPersistence warning:', err);
    });
  }
  return persistenceInitPromise;
};

// Initialize persistence immediately in browser
if (typeof window !== 'undefined') {
  ensureAuthPersistence();
}

// Drive Backup Preference persistence key
export const DRIVE_BACKUP_ENABLED_STORAGE_KEY = 'wms.driveBackupEnabled';

export const getDriveBackupPreference = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(DRIVE_BACKUP_ENABLED_STORAGE_KEY) === 'true';
    }
  } catch (e) {
    console.warn('Error reading drive backup preference:', e);
  }
  return false;
};

export const setDriveBackupPreference = (enabled: boolean): void => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (enabled) {
        window.localStorage.setItem(DRIVE_BACKUP_ENABLED_STORAGE_KEY, 'true');
      } else {
        window.localStorage.removeItem(DRIVE_BACKUP_ENABLED_STORAGE_KEY);
      }
    }
  } catch (e) {
    console.warn('Error writing drive backup preference:', e);
  }
};

// Minimum Scope Principle:
// 'https://www.googleapis.com/auth/drive.file' grants per-file access to files/folders created by this app.
// Full 'https://www.googleapis.com/auth/drive' is intentionally omitted to avoid over-privileged access.
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export interface GoogleProviderOptions {
  forceConsent?: boolean;
  forceAccountSelection?: boolean;
}

export const createGoogleDriveProvider = (
  options?: boolean | GoogleProviderOptions
): GoogleAuthProvider => {
  const p = new GoogleAuthProvider();
  p.addScope(DRIVE_FILE_SCOPE);

  const forceConsent = typeof options === 'boolean' ? options : Boolean(options?.forceConsent);
  const forceAccountSelection = typeof options === 'object' ? Boolean(options?.forceAccountSelection) : false;

  if (forceConsent && forceAccountSelection) {
    p.setCustomParameters({
      prompt: 'consent select_account'
    });
  } else if (forceConsent) {
    p.setCustomParameters({
      prompt: 'consent'
    });
  } else if (forceAccountSelection) {
    p.setCustomParameters({
      prompt: 'select_account'
    });
  }
  // Default: NO prompt custom parameter is set (omits prompt completely to prevent account picker)
  return p;
};

// State Model: Disconnected, Signed in without Drive, Connected, Expired, Revoked, Error, Recovery Required
export type DriveAuthState =
  | 'signed-out'
  | 'signed-in-drive-not-connected'
  | 'drive-connected'
  | 'drive-authorization-expired'
  | 'drive-permission-revoked'
  | 'drive-error'
  | 'drive-auth-recovery-required';

export type DriveErrorCode =
  | 'AUTH_EXPIRED'          // 401
  | 'PERMISSION_REVOKED'     // 403 (revoked, insufficient permissions)
  | 'INSUFFICIENT_SCOPE'     // 403 (scope missing)
  | 'QUOTA_EXCEEDED'         // 403/429 (rate/usage limits)
  | 'NOT_FOUND'              // 404
  | 'NETWORK_ERROR'          // Network disconnect / failed to fetch
  | 'MALFORMED_BACKUP'       // Invalid JSON payload
  | 'UNAUTHORIZED'           // Missing or null token
  | 'UNKNOWN_ERROR';

export class DriveApiError extends Error {
  public override readonly name = 'DriveApiError';
  constructor(
    public readonly code: DriveErrorCode,
    public readonly status: number | null,
    message: string,
    public readonly safeDetails?: string
  ) {
    super(message);
    // Ensure prototype chain is properly restored in all environments
    Object.setPrototypeOf(this, DriveApiError.prototype);
  }
}

// In-memory token cache (NEVER persisted to LocalStorage, IndexedDB, or logs)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Clean token getter/setter for testing & runtime
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null): void => {
  cachedAccessToken = token;
};

export interface EnsureDriveAuthOptions {
  /**
   * If true, allows showing interactive popup to recover authorization when token is missing/expired.
   * Defaults to false (silent check only; prevents unexpected popups on page load/render).
   */
  interactive?: boolean;
  /**
   * If true, explicitly tests Drive API access via lightweight folder check.
   */
  forceVerify?: boolean;
}

let authInitialized = false;
let authInitPromise: Promise<User | null> | null = null;

/**
 * Wait for Firebase Auth to complete initial asynchronous session restoration
 */
export const waitForAuthInit = (): Promise<User | null> => {
  if (authInitialized) {
    return Promise.resolve(auth.currentUser);
  }
  if (!authInitPromise) {
    authInitPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        authInitialized = true;
        unsubscribe();
        resolve(user);
      });
    });
  }
  return authInitPromise;
};

/**
 * Drive Authorization Recovery Gateway
 *
 * Centralizes all Drive authorization checks and recovery:
 * 1. Checks Firebase user authentication
 * 2. Checks driveBackupEnabled preference
 * 3. Checks in-memory cachedAccessToken
 * 4. Verifies token validity if needed
 * 5. Returns valid token or recovers if allowed
 * 6. Never resets driveBackupEnabled on token loss or transient errors
 */
export async function ensureDriveAuthorization(options: EnsureDriveAuthOptions = {}): Promise<string> {
  await waitForAuthInit();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new DriveApiError(
      'UNAUTHORIZED',
      401,
      '로그인이 필요합니다. Google 계정을 먼저 연동해 주세요.'
    );
  }

  const isPreferenceEnabled = getDriveBackupPreference();

  // Case 1: Token exists in memory
  if (cachedAccessToken) {
    if (options.forceVerify) {
      try {
        await verifyDriveAccess(cachedAccessToken);
        return cachedAccessToken;
      } catch (err: any) {
        if (err instanceof DriveApiError && err.code === 'AUTH_EXPIRED') {
          // Token expired, clear memory cache only (preference is preserved)
          cachedAccessToken = null;
        } else {
          // PERMISSION_REVOKED or NETWORK_ERROR -> bubble up
          throw err;
        }
      }
    } else {
      return cachedAccessToken;
    }
  }

  // Case 2: Token is missing from memory (or expired above)
  if (options.interactive) {
    const signInResult = await googleSignIn({ forceConsent: false, forceAccountSelection: false });
    if (!signInResult?.accessToken) {
      throw new DriveApiError(
        'AUTH_EXPIRED',
        401,
        'Google Drive 인증 복구에 실패했습니다. 다시 연결해 주세요.'
      );
    }
    return signInResult.accessToken;
  }

  // Case 3: Silent check when token is missing
  if (isPreferenceEnabled) {
    throw new DriveApiError(
      'AUTH_EXPIRED',
      401,
      'Google Drive 인증 복구가 필요합니다. 드라이브를 다시 연결해 주세요.'
    );
  } else {
    throw new DriveApiError(
      'UNAUTHORIZED',
      401,
      'Google Drive 백업이 활성화되어 있지 않습니다.'
    );
  }
}

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  size?: string;
}

export const BACKUP_FOLDER_NAME = 'WorkoutTracker_Backups';

/**
 * Maps raw HTTP responses / fetch errors to typed DriveApiError
 */
export async function handleDriveApiResponse(res: Response, contextAction: string): Promise<any> {
  if (res.ok) {
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  let errorData: any = null;
  let errorReason = '';
  let errorMsg = '';
  try {
    errorData = await res.json();
    if (errorData?.error?.errors?.[0]?.reason) {
      errorReason = errorData.error.errors[0].reason;
    }
    errorMsg = errorData?.error?.message || '';
  } catch {
    // response was not JSON
  }

  if (res.status === 401) {
    cachedAccessToken = null;
    throw new DriveApiError(
      'AUTH_EXPIRED',
      401,
      'Google Drive 인증이 만료되었습니다. 다시 연결해 주세요.',
      `[Drive 401] ${contextAction}: Token expired or unauthorized`
    );
  }

  if (res.status === 403) {
    if (
      errorReason === 'rateLimitExceeded' ||
      errorReason === 'userRateLimitExceeded' ||
      errorReason === 'dailyLimitExceeded' ||
      errorReason === 'quotaExceeded'
    ) {
      throw new DriveApiError(
        'QUOTA_EXCEEDED',
        403,
        'Google Drive API 사용량 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
        `[Drive 403 Quota] ${contextAction}: ${errorReason}`
      );
    }
    if (
      errorReason === 'insufficientPermissions' ||
      errorReason === 'insufficientFilePermissions' ||
      errorReason === 'accessNotConfigured' ||
      errorReason === 'forbidden'
    ) {
      throw new DriveApiError(
        'PERMISSION_REVOKED',
        403,
        'Google Drive 권한이 거부되었거나 해제되었습니다. 권한을 다시 허용해 주세요.',
        `[Drive 403 Permission] ${contextAction}: ${errorReason}`
      );
    }
    throw new DriveApiError(
      'PERMISSION_REVOKED',
      403,
      'Google Drive 권한이 유효하지 않습니다. 다시 연결해 주세요.',
      `[Drive 403] ${contextAction}: ${errorReason || errorMsg || res.statusText}`
    );
  }

  if (res.status === 404) {
    throw new DriveApiError(
      'NOT_FOUND',
      404,
      '요청한 Google Drive 백업 파일 또는 폴더를 찾을 수 없습니다.',
      `[Drive 404] ${contextAction}: File or folder not found`
    );
  }

  if (res.status === 429) {
    throw new DriveApiError(
      'QUOTA_EXCEEDED',
      429,
      '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      `[Drive 429] ${contextAction}: Rate limit exceeded`
    );
  }

  throw new DriveApiError(
    'UNKNOWN_ERROR',
    res.status,
    `Google Drive 처리 중 오류가 발생했습니다 (${res.status}).`,
    `[Drive ${res.status}] ${contextAction}: ${errorMsg || res.statusText}`
  );
}

/**
 * Safe fetch wrapper that catches network/offline exceptions
 */
export async function safeDriveFetch(
  url: string,
  options: RequestInit,
  contextAction: string
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err: any) {
    if (err instanceof DriveApiError) throw err;
    throw new DriveApiError(
      'NETWORK_ERROR',
      null,
      'Google Drive 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.',
      `[Drive Network Error] ${contextAction}: ${err?.message || 'Network request failed'}`
    );
  }
}

/**
 * Verifies active Google Drive access and token validity with a lightweight query
 */
export async function verifyDriveAccess(accessToken: string): Promise<boolean> {
  if (!accessToken) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 인증 토큰이 없습니다.');
  }

  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )}&pageSize=1&fields=files(id)`;

  const res = await safeDriveFetch(
    searchUrl,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    'verifyDriveAccess'
  );

  await handleDriveApiResponse(res, 'verifyDriveAccess');
  return true;
}

export interface AuthStateListenerCallbacks {
  onSignedInWithDrive?: (user: User, token: string) => void;
  onSignedInNoDrive?: (user: User) => void;
  onSignedOut?: () => void;
  onDriveAuthExpired?: (user: User) => void;
  onDrivePermissionRevoked?: (user: User) => void;
  onDriveError?: (user: User, error: DriveApiError) => void;
  onDriveAuthRecoveryRequired?: (user: User) => void;
}

/**
 * Initialize auth state listener.
 * Strictly separates Firebase user authentication from Google Drive authorization.
 */
export const initAuth = (callbacks: AuthStateListenerCallbacks | ((user: User, token: string) => void)) => {
  const cb: AuthStateListenerCallbacks =
    typeof callbacks === 'function'
      ? { onSignedInWithDrive: callbacks }
      : callbacks;

  return onAuthStateChanged(auth, async (user: User | null) => {
    authInitialized = true;
    if (!user) {
      cachedAccessToken = null;
      if (cb.onSignedOut) cb.onSignedOut();
      return;
    }

    // User is authenticated in Firebase
    if (!cachedAccessToken) {
      // Check if user previously had Drive backup enabled
      const isDriveEnabled = getDriveBackupPreference();
      if (isDriveEnabled) {
        // Drive backup is enabled in preferences, but memory access token is missing (e.g. after page refresh)
        // Needs authorization recovery, do NOT revert to signed-in-drive-not-connected!
        if (cb.onDriveAuthRecoveryRequired) {
          cb.onDriveAuthRecoveryRequired(user);
        } else if (cb.onDriveAuthExpired) {
          cb.onDriveAuthExpired(user);
        }
      } else {
        // Token is not in memory and Drive was never connected/enabled
        if (cb.onSignedInNoDrive) {
          cb.onSignedInNoDrive(user);
        }
      }
      return;
    }

    // Token exists in memory -> verify Drive authorization
    try {
      await verifyDriveAccess(cachedAccessToken);
      setDriveBackupPreference(true);
      if (cb.onSignedInWithDrive) {
        cb.onSignedInWithDrive(user, cachedAccessToken);
      }
    } catch (err: any) {
      if (err instanceof DriveApiError) {
        if (err.code === 'AUTH_EXPIRED') {
          if (cb.onDriveAuthExpired) cb.onDriveAuthExpired(user);
        } else if (err.code === 'PERMISSION_REVOKED') {
          if (cb.onDrivePermissionRevoked) cb.onDrivePermissionRevoked(user);
        } else {
          if (cb.onDriveError) cb.onDriveError(user, err);
        }
      } else {
        if (cb.onDriveError) {
          cb.onDriveError(
            user,
            new DriveApiError('UNKNOWN_ERROR', null, err?.message || '알 수 없는 Drive 오류')
          );
        }
      }
    }
  });
};

export interface GoogleSignInOptions {
  forceConsent?: boolean;
  forceAccountSelection?: boolean;
}

/**
 * Initiate Google Sign-In with Drive Scope
 * Priority: Reuses active Firebase auth session when available to eliminate redundant account choice prompts.
 */
export const googleSignIn = async (
  options?: boolean | GoogleSignInOptions
): Promise<{
  user: User;
  accessToken: string;
  driveState: DriveAuthState;
} | null> => {
  const forceConsent = typeof options === 'boolean' ? options : Boolean(options?.forceConsent);
  const forceAccountSelection = typeof options === 'object' ? Boolean(options?.forceAccountSelection) : false;

  await ensureAuthPersistence();

  // Firebase Session Priority Guard:
  // If user is already authenticated in Firebase and active token is valid in memory,
  // and no explicit re-consent or account selection is requested, reuse session directly.
  if (auth.currentUser && cachedAccessToken && !forceConsent && !forceAccountSelection) {
    return {
      user: auth.currentUser,
      accessToken: cachedAccessToken,
      driveState: 'drive-connected'
    };
  }

  try {
    isSigningIn = true;
    const provider = createGoogleDriveProvider({ forceConsent, forceAccountSelection });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new DriveApiError(
        'UNAUTHORIZED',
        null,
        'Google 로그인에서 Drive 접근 토큰을 획득하지 못했습니다.'
      );
    }

    cachedAccessToken = credential.accessToken;

    // Verify Drive access immediately upon token acquisition
    await verifyDriveAccess(cachedAccessToken);

    // Save drive backup preference as enabled
    setDriveBackupPreference(true);

    return {
      user: result.user,
      accessToken: cachedAccessToken,
      driveState: 'drive-connected'
    };
  } catch (error: any) {
    if (error instanceof DriveApiError) {
      throw error;
    }
    // Check Firebase / OAuth popup error codes
    const code = error?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      throw new DriveApiError('UNKNOWN_ERROR', null, '로그인 창이 닫혔습니다. 다시 시도해 주세요.');
    }
    throw new DriveApiError(
      'UNKNOWN_ERROR',
      null,
      `Google 로그인 실패: ${error?.message || '알 수 없는 오류'}`
    );
  } finally {
    isSigningIn = false;
  }
};

/**
 * Explicit alias for signInWithGoogle
 */
export const signInWithGoogle = googleSignIn;

/**
 * Reconnect / Auth Recovery for Google Drive without resetting Firebase user session
 * Defaults to forceConsent: false and forceAccountSelection: false to eliminate repeated consent & account screens.
 * Pass { forceConsent: true } only when explicit re-consent is required (e.g. permission revoked).
 * Pass { forceAccountSelection: true } only when explicit account change is required.
 */
export const reconnectGoogleDrive = async (
  options?: boolean | GoogleSignInOptions
): Promise<{
  user: User;
  accessToken: string;
}> => {
  const forceConsent = typeof options === 'boolean' ? options : Boolean(options?.forceConsent);
  const forceAccountSelection = typeof options === 'object' ? Boolean(options?.forceAccountSelection) : false;
  const result = await googleSignIn({ forceConsent, forceAccountSelection });
  if (!result) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 재연결에 실패했습니다.');
  }
  return {
    user: result.user,
    accessToken: result.accessToken
  };
};

/**
 * Logout from Firebase and clear in-memory token and clear preference (explicit user unlink)
 */
export const logout = async (): Promise<void> => {
  try {
    await auth.signOut();
  } finally {
    cachedAccessToken = null;
    setDriveBackupPreference(false);
  }
};

/**
 * Find or create the dedicated backups folder on Google Drive
 */
export async function getOrCreateBackupFolder(accessToken: string): Promise<string> {
  if (!accessToken) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 인증 토큰이 없습니다.');
  }

  // 1. Search for existing folder
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )}&fields=files(id)`;

  const searchRes = await safeDriveFetch(
    searchUrl,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    'searchBackupFolder'
  );

  const searchData = await handleDriveApiResponse(searchRes, 'searchBackupFolder');
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 2. Create the folder if not found
  const createRes = await safeDriveFetch(
    'https://www.googleapis.com/drive/v3/files',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: BACKUP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder'
      })
    },
    'createBackupFolder'
  );

  const createData = await handleDriveApiResponse(createRes, 'createBackupFolder');
  return createData.id;
}

/**
 * Save snapshot file to Google Drive under the dedicated backups folder
 */
export async function saveBackupToDrive(
  accessTokenOrSnapshot: string | any,
  optionalSnapshot?: any
): Promise<GoogleDriveFile> {
  const accessToken =
    typeof accessTokenOrSnapshot === 'string'
      ? accessTokenOrSnapshot
      : await ensureDriveAuthorization();
  const snapshot =
    typeof accessTokenOrSnapshot === 'string'
      ? optionalSnapshot
      : accessTokenOrSnapshot;

  if (!accessToken) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 인증 토큰이 없습니다.');
  }

  const folderId = await getOrCreateBackupFolder(accessToken);
  const dateStr = new Date().toISOString().split('T')[0];
  const timeStr = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
  const filename = `wms_workout_backup_v${snapshot.version || '2.1'}_${dateStr}_${timeStr}.json`;

  const boundary = 'workout_tracker_drive_boundary';
  const metadata = {
    name: filename,
    parents: [folderId],
    mimeType: 'application/json'
  };

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(snapshot, null, 2),
    `--${boundary}--`
  ].join('\r\n');

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
  const uploadRes = await safeDriveFetch(
    uploadUrl,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: body
    },
    'saveBackupToDrive'
  );

  return await handleDriveApiResponse(uploadRes, 'saveBackupToDrive');
}

/**
 * List backups inside the dedicated backup folder
 */
export async function listBackupsFromDrive(accessToken?: string): Promise<GoogleDriveFile[]> {
  const token = accessToken || (await ensureDriveAuthorization());
  if (!token) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 인증 토큰이 없습니다.');
  }

  const folderId = await getOrCreateBackupFolder(token);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and mimeType = 'application/json' and trashed = false`
  )}&fields=files(id,name,mimeType,createdTime,size)&orderBy=createdTime desc`;

  const listRes = await safeDriveFetch(
    listUrl,
    {
      headers: { Authorization: `Bearer ${token}` }
    },
    'listBackupsFromDrive'
  );

  const listData = await handleDriveApiResponse(listRes, 'listBackupsFromDrive');
  return listData.files || [];
}

/**
 * Download snapshot file from Google Drive
 */
export async function downloadBackupFromDrive(
  accessTokenOrFileId: string,
  optionalFileId?: string
): Promise<any> {
  const accessToken = optionalFileId
    ? accessTokenOrFileId
    : await ensureDriveAuthorization();
  const fileId = optionalFileId || accessTokenOrFileId;

  if (!accessToken) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 인증 토큰이 없습니다.');
  }
  if (!fileId) {
    throw new DriveApiError('NOT_FOUND', 404, '다운로드할 백업 파일 ID가 지정되지 않았습니다.');
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await safeDriveFetch(
    downloadUrl,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    'downloadBackupFromDrive'
  );

  return await handleDriveApiResponse(res, 'downloadBackupFromDrive');
}

/**
 * Delete a backup file from Google Drive
 */
export async function deleteBackupFromDrive(
  accessTokenOrFileId: string,
  optionalFileId?: string
): Promise<void> {
  const accessToken = optionalFileId
    ? accessTokenOrFileId
    : await ensureDriveAuthorization();
  const fileId = optionalFileId || accessTokenOrFileId;

  if (!accessToken) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 인증 토큰이 없습니다.');
  }
  if (!fileId) {
    throw new DriveApiError('NOT_FOUND', 404, '삭제할 백업 파일 ID가 지정되지 않았습니다.');
  }

  const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await safeDriveFetch(
    deleteUrl,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    },
    'deleteBackupFromDrive'
  );

  await handleDriveApiResponse(res, 'deleteBackupFromDrive');
}
