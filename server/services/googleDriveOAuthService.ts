/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import {
  GoogleDriveOAuthService,
  DriveAuthorizationState,
  CreateAuthUrlOptions,
  AuthorizationExchangeResult,
  GoogleOAuthTokenResult
} from '../types/googleDriveOAuth.types';
import { getGoogleDriveOAuthConfig, GoogleDriveOAuthConfig } from '../config/googleOAuthConfig';

export interface OAuthStateEntry {
  userId: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

/**
 * Ephemeral In-Memory State Store for CSRF Protection
 * Enforces one-time use and TTL expiration (default 10 minutes).
 */
export class EphemeralOAuthStateStore {
  private states = new Map<string, OAuthStateEntry>();
  private readonly defaultTtlMs: number;

  constructor(ttlMs = 10 * 60 * 1000) {
    this.defaultTtlMs = ttlMs;
  }

  /**
   * Creates and stores a new cryptographically secure state
   */
  createState(userId: string, ttlMs?: number): string {
    this.cleanup();
    const state = crypto.randomBytes(32).toString('hex');
    const now = Date.now();
    const expiresAt = now + (ttlMs || this.defaultTtlMs);

    this.states.set(state, {
      userId,
      createdAt: now,
      expiresAt,
      used: false
    });

    return state;
  }

  /**
   * Consumes a state, enforcing one-time use and expiration.
   * Returns an object indicating validation outcome and associated userId.
   */
  consumeState(state: string): { valid: boolean; userId?: string; reason?: 'INVALID_STATE' | 'STATE_EXPIRED' } {
    if (!state || typeof state !== 'string') {
      return { valid: false, reason: 'INVALID_STATE' };
    }

    const entry = this.states.get(state);
    if (!entry) {
      return { valid: false, reason: 'INVALID_STATE' };
    }

    // Always remove immediately to enforce single-use / prevent replay
    this.states.delete(state);

    if (entry.used) {
      return { valid: false, reason: 'INVALID_STATE' };
    }

    if (Date.now() > entry.expiresAt) {
      return { valid: false, reason: 'STATE_EXPIRED' };
    }

    entry.used = true;
    return { valid: true, userId: entry.userId };
  }

  /**
   * Cleans up expired states from memory
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.states.entries()) {
      if (now > entry.expiresAt || entry.used) {
        this.states.delete(key);
      }
    }
  }

  /**
   * Helper for tests to inspect store count
   */
  get size(): number {
    return this.states.size;
  }

  /**
   * Clears all states
   */
  clear(): void {
    this.states.clear();
  }
}

/**
 * Type for token exchange fetch function (supports dependency injection for testing)
 */
export type TokenExchangeFetcher = (
  url: string,
  options: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
}>;

/**
 * Server Google Drive OAuth Service Implementation (CU3.2)
 *
 * Implements:
 * 1. Authorization URL generation with CSRF state
 * 2. State verification & one-time use enforcement
 * 3. Server-side Authorization Code Exchange
 * 4. Token result validation (in-memory, no persistent refresh token storage yet)
 */
export class ServerGoogleDriveOAuthService implements GoogleDriveOAuthService {
  private readonly stateStore: EphemeralOAuthStateStore;
  private readonly configProvider: () => GoogleDriveOAuthConfig;
  private tokenFetcher: TokenExchangeFetcher;

  constructor(
    stateStore?: EphemeralOAuthStateStore,
    configProvider?: () => GoogleDriveOAuthConfig,
    tokenFetcher?: TokenExchangeFetcher
  ) {
    this.stateStore = stateStore || new EphemeralOAuthStateStore();
    this.configProvider = configProvider || getGoogleDriveOAuthConfig;
    this.tokenFetcher =
      tokenFetcher ||
      (async (url, opts) => {
        const res = await fetch(url, opts);
        return {
          ok: res.ok,
          status: res.status,
          json: () => res.json(),
          text: () => res.text()
        };
      });
  }

  /**
   * For testing: set custom token fetcher
   */
  setTokenFetcher(fetcher: TokenExchangeFetcher): void {
    this.tokenFetcher = fetcher;
  }

  /**
   * Retrieves the current OAuth authorization state for an authenticated user.
   */
  async getAuthorizationStatus(userId: string): Promise<DriveAuthorizationState> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return {
        status: 'error',
        canRefresh: false,
        error: 'Invalid or missing user identifier'
      };
    }

    // CU3.2: No persistent storage yet. Returns not-connected.
    return {
      status: 'not-connected',
      canRefresh: false
    };
  }

  /**
   * Retrieves a valid access token for Google Drive API operations.
   */
  async getValidAccessToken(userId: string): Promise<string> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('UNAUTHORIZED: Valid user identifier is required');
    }

    throw new Error('NOT_CONNECTED: No server-side OAuth credential found for this user');
  }

  /**
   * Generates Google OAuth Authorization URL with CSRF state protection.
   */
  async createAuthorizationUrl(userId: string, options: CreateAuthUrlOptions = {}): Promise<string> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('UNAUTHORIZED: Valid user identifier is required to start authorization');
    }

    const config = this.configProvider();
    const state = this.stateStore.createState(userId.trim());

    const redirectUri = options.redirectUri || config.redirectUri;
    const url = new URL(config.authBaseUrl);

    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scope);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('state', state);

    if (options.loginHint && typeof options.loginHint === 'string' && options.loginHint.trim() !== '') {
      url.searchParams.set('login_hint', options.loginHint.trim());
    }

    if (options.forceConsent) {
      url.searchParams.set('prompt', 'consent');
    } else if (options.prompt) {
      url.searchParams.set('prompt', options.prompt);
    }

    return url.toString();
  }

  /**
   * Handles Google callback, validates CSRF state, and performs Authorization Code Exchange.
   */
  async handleAuthorizationCallback(code: string, state: string): Promise<AuthorizationExchangeResult> {
    // 1. Validate State
    const stateValidation = this.stateStore.consumeState(state);
    if (!stateValidation.valid || !stateValidation.userId) {
      const reason = stateValidation.reason || 'INVALID_STATE';
      return {
        success: false,
        userId: '',
        hasRefreshToken: false,
        errorCode: reason,
        error: reason === 'STATE_EXPIRED' ? 'OAuth state has expired. Please try connecting again.' : 'Invalid or expired OAuth state.'
      };
    }

    const userId = stateValidation.userId;

    // 2. Validate Code
    if (!code || typeof code !== 'string' || code.trim() === '') {
      return {
        success: false,
        userId,
        hasRefreshToken: false,
        errorCode: 'MISSING_CODE',
        error: 'Authorization code is missing from callback.'
      };
    }

    const config = this.configProvider();

    // 3. Check Server Configuration
    if (!config.clientId || !config.clientSecret) {
      return {
        success: false,
        userId,
        hasRefreshToken: false,
        errorCode: 'SERVER_CONFIGURATION_ERROR',
        error: 'Server OAuth credentials are not properly configured.'
      };
    }

    // 4. Exchange Code with Google Token Endpoint
    try {
      const bodyParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.trim(),
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri
      });

      const response = await this.tokenFetcher(config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body: bodyParams.toString()
      });

      if (!response.ok) {
        const errorStatus = response.status;
        console.warn(`[OAuth Service] Token exchange failed with status ${errorStatus}`);
        return {
          success: false,
          userId,
          hasRefreshToken: false,
          errorCode: 'TOKEN_EXCHANGE_FAILED',
          error: `Google OAuth token exchange failed (status: ${errorStatus}).`
        };
      }

      const tokenData = await response.json();

      if (!tokenData || !tokenData.access_token) {
        return {
          success: false,
          userId,
          hasRefreshToken: false,
          errorCode: 'INVALID_TOKEN_RESPONSE',
          error: 'Google token endpoint returned an invalid payload (missing access_token).'
        };
      }

      // Internal Token Result (Server-only memory representation)
      const tokenResult: GoogleOAuthTokenResult = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: Date.now() + (tokenData.expires_in ? Number(tokenData.expires_in) * 1000 : 3600 * 1000),
        scope: tokenData.scope,
        tokenType: tokenData.token_type
      };

      // CU3.2 Security invariant: In-memory validation only, no database persistence yet.
      const hasRefreshToken = Boolean(tokenResult.refreshToken);

      return {
        success: true,
        userId,
        scope: tokenResult.scope,
        hasRefreshToken
      };
    } catch (err: any) {
      console.warn('[OAuth Service] Error during code exchange:', err?.message || err);
      return {
        success: false,
        userId,
        hasRefreshToken: false,
        errorCode: 'TOKEN_EXCHANGE_FAILED',
        error: 'Network or internal error occurred while exchanging authorization code.'
      };
    }
  }

  /**
   * Disconnects stored credentials for the user.
   */
  async disconnect(userId: string): Promise<void> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new Error('UNAUTHORIZED: Valid user identifier is required');
    }
  }

  /**
   * State store accessor for testing
   */
  getStateStore(): EphemeralOAuthStateStore {
    return this.stateStore;
  }
}

// Default singleton instance
export const googleDriveOAuthService: GoogleDriveOAuthService = new ServerGoogleDriveOAuthService();
