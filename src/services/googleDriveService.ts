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
  Auth
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize firebase app if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth: Auth = getAuth(app);

// Minimum Scope Principle:
// 'https://www.googleapis.com/auth/drive.file' grants per-file access to files/folders created by this app.
// Full 'https://www.googleapis.com/auth/drive' is intentionally omitted to avoid over-privileged access.
export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const createGoogleDriveProvider = (promptConsent = false): GoogleAuthProvider => {
  const p = new GoogleAuthProvider();
  p.addScope(DRIVE_FILE_SCOPE);
  if (promptConsent) {
    p.setCustomParameters({
      prompt: 'consent select_account'
    });
  }
  return p;
};

// State Model: Disconnected, Signed in without Drive, Connected, Expired, Revoked, Error
export type DriveAuthState =
  | 'signed-out'
  | 'signed-in-drive-not-connected'
  | 'drive-connected'
  | 'drive-authorization-expired'
  | 'drive-permission-revoked'
  | 'drive-error';

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
    if (!user) {
      cachedAccessToken = null;
      if (cb.onSignedOut) cb.onSignedOut();
      return;
    }

    // User is authenticated in Firebase
    if (!cachedAccessToken) {
      // Token is not in memory -> Signed in, but Drive is not yet connected
      if (cb.onSignedInNoDrive) {
        cb.onSignedInNoDrive(user);
      }
      return;
    }

    // Token exists in memory -> verify Drive authorization
    try {
      await verifyDriveAccess(cachedAccessToken);
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

/**
 * Initiate Google Sign-In with Drive Scope
 */
export const googleSignIn = async (promptConsent = false): Promise<{
  user: User;
  accessToken: string;
  driveState: DriveAuthState;
} | null> => {
  try {
    isSigningIn = true;
    const provider = createGoogleDriveProvider(promptConsent);
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
 * Reconnect / Re-consent Google Drive without resetting Firebase user session
 */
export const reconnectGoogleDrive = async (): Promise<{
  user: User;
  accessToken: string;
}> => {
  const result = await googleSignIn(true);
  if (!result) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 재연결에 실패했습니다.');
  }
  return {
    user: result.user,
    accessToken: result.accessToken
  };
};

/**
 * Logout from Firebase and clear in-memory token
 */
export const logout = async (): Promise<void> => {
  try {
    await auth.signOut();
  } finally {
    cachedAccessToken = null;
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
  accessToken: string,
  snapshot: any
): Promise<GoogleDriveFile> {
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
export async function listBackupsFromDrive(accessToken: string): Promise<GoogleDriveFile[]> {
  if (!accessToken) {
    throw new DriveApiError('UNAUTHORIZED', 401, 'Google Drive 인증 토큰이 없습니다.');
  }

  const folderId = await getOrCreateBackupFolder(accessToken);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and mimeType = 'application/json' and trashed = false`
  )}&fields=files(id,name,mimeType,createdTime,size)&orderBy=createdTime desc`;

  const listRes = await safeDriveFetch(
    listUrl,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
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
  accessToken: string,
  fileId: string
): Promise<any> {
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
  accessToken: string,
  fileId: string
): Promise<void> {
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
