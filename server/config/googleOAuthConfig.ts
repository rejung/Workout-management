/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GOOGLE_DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_OAUTH_AUTH_BASE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface GoogleDriveOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  authBaseUrl: string;
  tokenUrl: string;
}

/**
 * Resolves the configured OAuth redirect URI with robust fallbacks
 */
export function resolveOAuthRedirectUri(): string {
  if (process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI && process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI.trim()) {
    return process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI.trim();
  }

  const appUrl = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (appUrl) {
    return `${appUrl}/api/google-drive/auth/callback`;
  }

  return 'http://localhost:3000/api/google-drive/auth/callback';
}

/**
 * Gets server-side Google Drive OAuth configuration
 */
export function getGoogleDriveOAuthConfig(): GoogleDriveOAuthConfig {
  return {
    clientId: (process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID || '').trim(),
    clientSecret: (process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET || '').trim(),
    redirectUri: resolveOAuthRedirectUri(),
    scope: GOOGLE_DRIVE_FILE_SCOPE,
    authBaseUrl: GOOGLE_OAUTH_AUTH_BASE_URL,
    tokenUrl: GOOGLE_OAUTH_TOKEN_URL
  };
}
