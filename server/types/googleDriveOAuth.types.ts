/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Server-side Google Drive Authorization Status
 */
export type DriveAuthorizationStatus =
  | 'not-connected'
  | 'connected'
  | 'reauth-required'
  | 'error';

/**
 * High-level authorization state returned to client consumers.
 * Note: Never includes access_token, refresh_token, client_secret, or auth_code.
 */
export interface DriveAuthorizationState {
  status: DriveAuthorizationStatus;
  canRefresh: boolean;
  connectedAt?: string;
  scope?: string;
  error?: string;
}

/**
 * Options for generating the Google OAuth Authorization URL
 */
export interface CreateAuthUrlOptions {
  forceConsent?: boolean;
  redirectUri?: string;
  prompt?: string;
  loginHint?: string;
}

/**
 * High-level result of the Authorization Code Exchange.
 * Note: Never includes raw access_token, refresh_token, or client_secret.
 */
export interface AuthorizationExchangeResult {
  success: boolean;
  userId: string;
  scope?: string;
  hasRefreshToken: boolean;
  error?: string;
  errorCode?:
    | 'OAUTH_ACCESS_DENIED'
    | 'INVALID_STATE'
    | 'STATE_EXPIRED'
    | 'MISSING_CODE'
    | 'TOKEN_EXCHANGE_FAILED'
    | 'INVALID_TOKEN_RESPONSE'
    | 'SERVER_CONFIGURATION_ERROR';
}

/**
 * Internal server-only model for OAuth Token Response.
 * Strictly forbidden from being exposed to the browser or in route responses.
 */
export interface GoogleOAuthTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

/**
 * Contract for Server-Side Google Drive OAuth Management
 */
export interface GoogleDriveOAuthService {
  /**
   * Retrieves the current OAuth authorization state for a specific WMS user.
   * @param userId Authenticated WMS user identifier (Firebase UID)
   */
  getAuthorizationStatus(userId: string): Promise<DriveAuthorizationState>;

  /**
   * Retrieves a valid access token for Google Drive API calls on the server.
   * Refreshes via stored refresh token if expired.
   * Note: This method is strictly for server-side API proxying and is NEVER exposed in HTTP responses.
   * @param userId Authenticated WMS user identifier (Firebase UID)
   */
  getValidAccessToken(userId: string): Promise<string>;

  /**
   * Generates a secure Google OAuth Authorization URL with CSRF state protection.
   * @param userId Authenticated WMS user identifier (Firebase UID)
   * @param options URL generation options (forceConsent, etc.)
   */
  createAuthorizationUrl(userId: string, options?: CreateAuthUrlOptions): Promise<string>;

  /**
   * Validates CSRF state and exchanges the authorization code with Google's token endpoint.
   * @param code Authorization code from Google callback
   * @param state CSRF state token from Google callback
   */
  handleAuthorizationCallback(code: string, state: string): Promise<AuthorizationExchangeResult>;

  /**
   * Revokes / disconnects the user's stored OAuth credentials on the server.
   * @param userId Authenticated WMS user identifier (Firebase UID)
   */
  disconnect(userId: string): Promise<void>;
}
