/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { googleDriveOAuthService } from '../services/googleDriveOAuthService';

export const googleDriveAuthRouter = Router();

/**
 * Helper to extract authenticated WMS user ID.
 *
 * Boundary Note (CU3.1 / CU3.2):
 * Inspects Authorization header (Bearer token) or authenticated user identifier header.
 */
function extractAuthenticatedUserId(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) return token;
  }

  const userIdHeader = req.headers['x-wms-user-id'];
  if (typeof userIdHeader === 'string' && userIdHeader.trim()) {
    return userIdHeader.trim();
  }

  // Also check JSON body if userId was sent in POST /start
  if (req.body && typeof req.body.userId === 'string' && req.body.userId.trim()) {
    return req.body.userId.trim();
  }

  return null;
}

/**
 * GET /api/google-drive/auth/status
 *
 * Retrieves the user's Google Drive OAuth authorization status on the server.
 * Security Invariant: Never returns tokens or client secrets.
 */
googleDriveAuthRouter.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractAuthenticatedUserId(req);

    if (!userId) {
      res.status(401).json({
        status: 'not-connected',
        canRefresh: false,
        error: 'Authentication required. Please provide a valid session token.'
      });
      return;
    }

    const authState = await googleDriveOAuthService.getAuthorizationStatus(userId);

    // Sanitize response to ensure strict security invariant
    res.json({
      status: authState.status,
      canRefresh: authState.canRefresh,
      ...(authState.connectedAt ? { connectedAt: authState.connectedAt } : {}),
      ...(authState.scope ? { scope: authState.scope } : {}),
      ...(authState.error ? { error: authState.error } : {})
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      canRefresh: false,
      error: error?.message || 'Internal server error checking authorization status'
    });
  }
});

/**
 * POST /api/google-drive/auth/start
 *
 * Initiates the Google OAuth Authorization Code Flow by generating a secure authorization URL.
 */
googleDriveAuthRouter.post('/start', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractAuthenticatedUserId(req);

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required to initiate Google Drive authorization.'
      });
      return;
    }

    const forceConsent = Boolean(req.body?.forceConsent);
    const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : undefined;
    const redirectUri = typeof req.body?.redirectUri === 'string' ? req.body.redirectUri : undefined;

    const authorizationUrl = await googleDriveOAuthService.createAuthorizationUrl(userId, {
      forceConsent,
      prompt,
      redirectUri
    });

    res.json({
      success: true,
      authorizationUrl
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to generate Google Drive authorization URL'
    });
  }
});

/**
 * GET /api/google-drive/auth/callback
 *
 * Google OAuth redirect callback endpoint.
 * Validates CSRF state and exchanges the authorization code with Google token endpoint.
 * Security Invariant: Never logs or exposes raw authorization_code, access_token, refresh_token, or client_secret.
 */
googleDriveAuthRouter.get('/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error, error_description } = req.query;

    // 1. Handle user cancellation or OAuth error from Google
    if (error) {
      console.warn(`[OAuth Callback] Received OAuth error: ${error}`);
      res.status(400).json({
        success: false,
        errorCode: 'OAUTH_ACCESS_DENIED',
        error: typeof error_description === 'string' ? error_description : 'Google authorization was denied or cancelled by user.'
      });
      return;
    }

    // 2. Validate presence of code and state
    if (!state || typeof state !== 'string') {
      res.status(400).json({
        success: false,
        errorCode: 'INVALID_STATE',
        error: 'OAuth state parameter is missing or invalid.'
      });
      return;
    }

    if (!code || typeof code !== 'string') {
      res.status(400).json({
        success: false,
        errorCode: 'MISSING_CODE',
        error: 'Authorization code is missing from callback query.'
      });
      return;
    }

    // 3. Perform state validation and token exchange via service boundary
    const exchangeResult = await googleDriveOAuthService.handleAuthorizationCallback(code, state);

    if (!exchangeResult.success) {
      res.status(400).json({
        success: false,
        errorCode: exchangeResult.errorCode || 'TOKEN_EXCHANGE_FAILED',
        error: exchangeResult.error || 'Failed to exchange authorization code.'
      });
      return;
    }

    // 4. Return sanitized success response (no tokens exposed)
    res.json({
      success: true,
      message: 'Google Drive authorization code exchanged successfully.',
      scope: exchangeResult.scope,
      hasRefreshToken: exchangeResult.hasRefreshToken
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      errorCode: 'TOKEN_EXCHANGE_FAILED',
      error: error?.message || 'Unexpected error during OAuth authorization callback'
    });
  }
});

/**
 * POST /api/google-drive/auth/disconnect
 *
 * Disconnects / revokes server-side Google Drive OAuth credentials for the authenticated user.
 */
googleDriveAuthRouter.post('/disconnect', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = extractAuthenticatedUserId(req);

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid session token.'
      });
      return;
    }

    await googleDriveOAuthService.disconnect(userId);

    res.json({
      success: true,
      message: 'Google Drive authorization successfully disconnected'
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to disconnect Google Drive authorization'
    });
  }
});
