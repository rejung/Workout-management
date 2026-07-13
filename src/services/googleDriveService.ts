/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, Auth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize firebase app if not already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth: Auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Add Google Drive scopes
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');

// In-memory token cache
let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener. Call this on app load.
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Initiate Google Popup Sign-in
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// Google Drive API Interfaces
export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  size?: string;
}

const BACKUP_FOLDER_NAME = 'WorkoutTracker_Backups';

/**
 * Find or create the dedicated backups folder on Google Drive
 */
export async function getOrCreateBackupFolder(accessToken: string): Promise<string> {
  // 1. Search for existing folder
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  )}&fields=files(id)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!searchRes.ok) {
    throw new Error(`Failed to search folder: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 2. Create the folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create backup folder: ${createRes.statusText}`);
  }

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Save snapshot file to Google Drive under the dedicated backups folder
 */
export async function saveBackupToDrive(accessToken: string, snapshot: any): Promise<GoogleDriveFile> {
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
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: body
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    throw new Error(`Failed to upload backup: ${uploadRes.statusText} - ${errorText}`);
  }

  return await uploadRes.json();
}

/**
 * List backups inside the dedicated backup folder
 */
export async function listBackupsFromDrive(accessToken: string): Promise<GoogleDriveFile[]> {
  const folderId = await getOrCreateBackupFolder(accessToken);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${folderId}' in parents and mimeType = 'application/json' and trashed = false`
  )}&fields=files(id,name,mimeType,createdTime,size)&orderBy=createdTime desc`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!listRes.ok) {
    throw new Error(`Failed to list backups: ${listRes.statusText}`);
  }

  const listData = await listRes.json();
  return listData.files || [];
}

/**
 * Download snapshot file from Google Drive
 */
export async function downloadBackupFromDrive(accessToken: string, fileId: string): Promise<any> {
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  
  const res = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to download backup: ${res.statusText}`);
  }

  return await res.json();
}

/**
 * Delete a backup file from Google Drive
 */
export async function deleteBackupFromDrive(accessToken: string, fileId: string): Promise<void> {
  const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;

  const res = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to delete backup from Drive: ${res.statusText}`);
  }
}
