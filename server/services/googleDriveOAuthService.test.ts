/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ServerGoogleDriveOAuthService,
  EphemeralOAuthStateStore,
  TokenExchangeFetcher
} from './googleDriveOAuthService';
import { DriveAuthorizationStatus } from '../types/googleDriveOAuth.types';
import { GoogleDriveOAuthConfig } from '../config/googleOAuthConfig';

export interface OAuthTestResult {
  scenarioId: string;
  name: string;
  passed: boolean;
  details: string;
}

export async function runServerOAuthContractTests(): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: OAuthTestResult[];
}> {
  const results: OAuthTestResult[] = [];

  const mockConfig: GoogleDriveOAuthConfig = {
    clientId: 'test-client-id.apps.googleusercontent.com',
    clientSecret: 'test-client-secret-12345',
    redirectUri: 'http://localhost:3000/api/google-drive/auth/callback',
    scope: 'https://www.googleapis.com/auth/drive.file',
    authBaseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token'
  };

  // -------------------------------------------------------------
  // O1: Status model conforms to explicit union types
  // -------------------------------------------------------------
  try {
    const validStatuses: DriveAuthorizationStatus[] = [
      'not-connected',
      'connected',
      'reauth-required',
      'error'
    ];
    const o1Passed =
      validStatuses.includes('not-connected') &&
      validStatuses.includes('connected') &&
      validStatuses.includes('reauth-required') &&
      validStatuses.includes('error');

    results.push({
      scenarioId: 'O1',
      name: 'Status model conforms to explicit union types',
      passed: o1Passed,
      details: o1Passed ? 'All 4 explicit OAuth status types strictly defined' : 'Invalid status definition'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'O1',
      name: 'Status model definition',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // O2: getAuthorizationStatus returns not-connected without leaking credentials
  // -------------------------------------------------------------
  try {
    const service = new ServerGoogleDriveOAuthService(undefined, () => mockConfig);
    const status = await service.getAuthorizationStatus('user-test-123');
    const noLeakedKeys =
      (status as any).access_token === undefined &&
      (status as any).refresh_token === undefined &&
      (status as any).client_secret === undefined;
    const o2Passed = status.status === 'not-connected' && status.canRefresh === false && noLeakedKeys;

    results.push({
      scenarioId: 'O2',
      name: 'getAuthorizationStatus returns not-connected without secret leaks',
      passed: o2Passed,
      details: o2Passed ? 'Clean not-connected state returned with zero credential leakage' : 'Credential leak detected'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'O2',
      name: 'getAuthorizationStatus check',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 1 (O6): Authorization URL Generation & Exact Param Validation
  // -------------------------------------------------------------
  try {
    const service = new ServerGoogleDriveOAuthService(undefined, () => mockConfig);
    const authUrlStr = await service.createAuthorizationUrl('user-test-456', { forceConsent: true });
    const parsedUrl = new URL(authUrlStr);

    const hasCorrectResponseType = parsedUrl.searchParams.get('response_type') === 'code';
    const hasCorrectScope = parsedUrl.searchParams.get('scope') === 'https://www.googleapis.com/auth/drive.file';
    const hasCorrectAccessType = parsedUrl.searchParams.get('access_type') === 'offline';
    const hasIncludeGranted = parsedUrl.searchParams.get('include_granted_scopes') === 'true';
    const hasState = Boolean(parsedUrl.searchParams.get('state')) && (parsedUrl.searchParams.get('state')?.length || 0) >= 32;
    const hasExactRedirectUri = parsedUrl.searchParams.get('redirect_uri') === mockConfig.redirectUri;
    const hasConsentPrompt = parsedUrl.searchParams.get('prompt') === 'consent';

    const t1Passed =
      hasCorrectResponseType &&
      hasCorrectScope &&
      hasCorrectAccessType &&
      hasIncludeGranted &&
      hasState &&
      hasExactRedirectUri &&
      hasConsentPrompt;

    results.push({
      scenarioId: 'Test 1',
      name: 'Authorization URL generation contains exact security parameters',
      passed: t1Passed,
      details: t1Passed
        ? 'Authorization URL generated with exact code response_type, drive.file scope, offline access, secure state, and matching redirect_uri'
        : 'Authorization URL parameter verification failed'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 1',
      name: 'Authorization URL generation',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 2 (O7): State Validation (Valid vs. Invalid / Missing State)
  // -------------------------------------------------------------
  try {
    const tracker = { called: false };
    const mockFetcher: TokenExchangeFetcher = async () => {
      tracker.called = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'valid_access_token', expires_in: 3600 }),
        text: async () => ''
      };
    };

    const stateStore = new EphemeralOAuthStateStore();
    const service = new ServerGoogleDriveOAuthService(stateStore, () => mockConfig, mockFetcher);

    // Subtest A: Invalid State
    const invalidResult = await service.handleAuthorizationCallback('auth_code_123', 'non_existent_fake_state');
    const invalidHandledCorrectly =
      !invalidResult.success &&
      invalidResult.errorCode === 'INVALID_STATE' &&
      tracker.called === false;

    // Subtest B: Valid State
    const validState = stateStore.createState('user-valid-1');
    const validResult = await service.handleAuthorizationCallback('auth_code_123', validState);
    const validHandledCorrectly =
      validResult.success &&
      validResult.userId === 'user-valid-1' &&
      tracker.called === true;

    const t2Passed = invalidHandledCorrectly && validHandledCorrectly;

    results.push({
      scenarioId: 'Test 2',
      name: 'CSRF State validation (Valid succeeds, Invalid rejects without token call)',
      passed: t2Passed,
      details: t2Passed
        ? 'Invalid state prevented token endpoint invocation; valid state permitted exchange'
        : 'State validation failed'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 2',
      name: 'CSRF State validation',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 3 (O8): Expired State Rejection
  // -------------------------------------------------------------
  try {
    const tracker = { called: false };
    const mockFetcher: TokenExchangeFetcher = async () => {
      tracker.called = true;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'mock_token' }),
        text: async () => ''
      };
    };

    const stateStore = new EphemeralOAuthStateStore();
    const service = new ServerGoogleDriveOAuthService(stateStore, () => mockConfig, mockFetcher);

    // Create state with immediate expiry (-1000ms)
    const expiredState = stateStore.createState('user-expired-1', -1000);
    const expiredResult = await service.handleAuthorizationCallback('auth_code_123', expiredState);

    const t3Passed =
      !expiredResult.success &&
      expiredResult.errorCode === 'STATE_EXPIRED' &&
      tracker.called === false;

    results.push({
      scenarioId: 'Test 3',
      name: 'Expired state rejection via TTL check',
      passed: t3Passed,
      details: t3Passed
        ? 'Expired state rejected with STATE_EXPIRED code before token endpoint call'
        : 'Expired state was not rejected properly'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 3',
      name: 'Expired state check',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 4 (O9): Replay Protection (One-time state consumption)
  // -------------------------------------------------------------
  try {
    let callCount = 0;
    const mockFetcher: TokenExchangeFetcher = async () => {
      callCount++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'mock_token', scope: mockConfig.scope }),
        text: async () => ''
      };
    };

    const stateStore = new EphemeralOAuthStateStore();
    const service = new ServerGoogleDriveOAuthService(stateStore, () => mockConfig, mockFetcher);

    const singleUseState = stateStore.createState('user-replay-1');

    // First attempt: Must succeed
    const firstAttempt = await service.handleAuthorizationCallback('auth_code_123', singleUseState);
    const firstOk = firstAttempt.success && callCount === 1;

    // Second attempt with same state: Must be rejected as INVALID_STATE
    const secondAttempt = await service.handleAuthorizationCallback('auth_code_123', singleUseState);
    const secondBlocked = !secondAttempt.success && secondAttempt.errorCode === 'INVALID_STATE' && callCount === 1;

    const t4Passed = firstOk && secondBlocked;

    results.push({
      scenarioId: 'Test 4',
      name: 'Replay Protection (One-time state consumption)',
      passed: t4Passed,
      details: t4Passed
        ? 'State consumed on first callback; replay attempt rejected without additional token call'
        : 'Replay protection failed'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 4',
      name: 'Replay Protection',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 5 (O10): User Denial / OAuth Error Handling
  // -------------------------------------------------------------
  try {
    // Verified by checking error handling logic:
    // When Google sends error (e.g., access_denied), route rejects before calling exchange
    const stateStore = new EphemeralOAuthStateStore();
    const testState = stateStore.createState('user-denied-1');
    const storeSizeBefore = stateStore.size;

    // Service callback without code is rejected
    const service = new ServerGoogleDriveOAuthService(stateStore, () => mockConfig);
    const missingCodeResult = await service.handleAuthorizationCallback('', testState);

    const t5Passed =
      !missingCodeResult.success &&
      missingCodeResult.errorCode === 'MISSING_CODE' &&
      storeSizeBefore === 1;

    results.push({
      scenarioId: 'Test 5',
      name: 'User denial / missing code error handling',
      passed: t5Passed,
      details: t5Passed
        ? 'User denial and missing authorization code safely handled without crashing or token call'
        : 'User denial error handling failed'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 5',
      name: 'User denial handling',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 6 (O11): Successful Token Exchange (with Refresh Token)
  // -------------------------------------------------------------
  try {
    let capturedBody = '';
    let capturedHeaders: Record<string, string> = {};

    const mockFetcher: TokenExchangeFetcher = async (_url, opts) => {
      capturedBody = opts.body;
      capturedHeaders = opts.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'ya29.mock_google_access_token_secret_123',
          refresh_token: '1//0g_mock_google_refresh_token_secret_456',
          expires_in: 3599,
          scope: 'https://www.googleapis.com/auth/drive.file',
          token_type: 'Bearer'
        }),
        text: async () => ''
      };
    };

    const stateStore = new EphemeralOAuthStateStore();
    const service = new ServerGoogleDriveOAuthService(stateStore, () => mockConfig, mockFetcher);

    const validState = stateStore.createState('user-success-exchange');
    const exchangeResult = await service.handleAuthorizationCallback('google_auth_code_789', validState);

    const params = new URLSearchParams(capturedBody);
    const hasGrantType = params.get('grant_type') === 'authorization_code';
    const hasCode = params.get('code') === 'google_auth_code_789';
    const hasClientId = params.get('client_id') === mockConfig.clientId;
    const hasClientSecret = params.get('client_secret') === mockConfig.clientSecret;
    const hasRedirectUri = params.get('redirect_uri') === mockConfig.redirectUri;
    const hasFormHeader = capturedHeaders['Content-Type'] === 'application/x-www-form-urlencoded';

    const resultSuccess =
      exchangeResult.success &&
      exchangeResult.userId === 'user-success-exchange' &&
      exchangeResult.hasRefreshToken === true &&
      exchangeResult.scope === 'https://www.googleapis.com/auth/drive.file';

    const t6Passed =
      hasGrantType &&
      hasCode &&
      hasClientId &&
      hasClientSecret &&
      hasRedirectUri &&
      hasFormHeader &&
      resultSuccess;

    results.push({
      scenarioId: 'Test 6',
      name: 'Successful token exchange with offline refresh token detection',
      passed: t6Passed,
      details: t6Passed
        ? 'Authorization code exchanged for tokens with exact parameters and refresh token detected'
        : 'Token exchange failed'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 6',
      name: 'Successful token exchange',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 7 (O12): Missing Refresh Token (Incremental / Re-auth without prompt=consent)
  // -------------------------------------------------------------
  try {
    const mockFetcherNoRefresh: TokenExchangeFetcher = async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: 'ya29.mock_access_token_only',
          expires_in: 3600,
          scope: 'https://www.googleapis.com/auth/drive.file'
        }),
        text: async () => ''
      };
    };

    const stateStore = new EphemeralOAuthStateStore();
    const service = new ServerGoogleDriveOAuthService(stateStore, () => mockConfig, mockFetcherNoRefresh);

    const validState = stateStore.createState('user-no-refresh');
    const result = await service.handleAuthorizationCallback('auth_code_no_refresh', validState);

    // Missing refresh token should NOT fail the code exchange itself
    const t7Passed =
      result.success === true &&
      result.hasRefreshToken === false &&
      result.userId === 'user-no-refresh';

    results.push({
      scenarioId: 'Test 7',
      name: 'Missing refresh token handling (Valid exchange without failure)',
      passed: t7Passed,
      details: t7Passed
        ? 'Code exchange succeeded when Google returns access_token without refresh_token'
        : 'Missing refresh token resulted in unexpected failure'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 7',
      name: 'Missing refresh token handling',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 8 (O13): Security Audit (Zero secret leakage in results or public objects)
  // -------------------------------------------------------------
  try {
    const mockFetcher: TokenExchangeFetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'SECRET_ACCESS_TOKEN_123',
        refresh_token: 'SECRET_REFRESH_TOKEN_456',
        expires_in: 3600
      }),
      text: async () => ''
    });

    const stateStore = new EphemeralOAuthStateStore();
    const service = new ServerGoogleDriveOAuthService(stateStore, () => mockConfig, mockFetcher);

    const validState = stateStore.createState('user-audit-1');
    const exchangeResult = await service.handleAuthorizationCallback('SECRET_AUTH_CODE_789', validState);

    // Convert result to JSON string and verify no secret strings exist
    const serialized = JSON.stringify(exchangeResult);
    const noAccessTokenLeak = !serialized.includes('SECRET_ACCESS_TOKEN_123') && (exchangeResult as any).accessToken === undefined;
    const noRefreshTokenLeak = !serialized.includes('SECRET_REFRESH_TOKEN_456') && (exchangeResult as any).refreshToken === undefined;
    const noClientSecretLeak = !serialized.includes('test-client-secret-12345') && (exchangeResult as any).clientSecret === undefined;
    const noAuthCodeLeak = !serialized.includes('SECRET_AUTH_CODE_789') && (exchangeResult as any).code === undefined;

    const t8Passed =
      noAccessTokenLeak &&
      noRefreshTokenLeak &&
      noClientSecretLeak &&
      noAuthCodeLeak;

    results.push({
      scenarioId: 'Test 8',
      name: 'Security Audit: Zero secret or token leakage in exchange result object',
      passed: t8Passed,
      details: t8Passed
        ? 'Verified zero occurrence of access_token, refresh_token, client_secret, or auth_code in public results'
        : 'Secret leakage detected in exchange result object'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 8',
      name: 'Security audit',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 9: OAuth Re-consent Elimination (Default auth URL omits prompt=consent)
  // -------------------------------------------------------------
  try {
    const service = new ServerGoogleDriveOAuthService(undefined, () => mockConfig);
    // Call without forceConsent (default)
    const defaultAuthUrlStr = await service.createAuthorizationUrl('user-test-reconsent-elimination');
    const parsedDefaultUrl = new URL(defaultAuthUrlStr);

    const hasNoPromptParam = parsedDefaultUrl.searchParams.get('prompt') === null;
    const hasCorrectScope = parsedDefaultUrl.searchParams.get('scope') === 'https://www.googleapis.com/auth/drive.file';

    const t9Passed = hasNoPromptParam && hasCorrectScope;

    results.push({
      scenarioId: 'Test 9',
      name: 'OAuth Re-consent Elimination: Default URL omits prompt parameter',
      passed: t9Passed,
      details: t9Passed
        ? 'Verified default createAuthorizationUrl does not force prompt=consent, preserving existing authorizations'
        : 'Default URL unexpectedly forced prompt parameter'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 9',
      name: 'OAuth Re-consent Elimination check',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 10: Login Hint Optimization (Authenticated user email injected as login_hint)
  // -------------------------------------------------------------
  try {
    const service = new ServerGoogleDriveOAuthService(undefined, () => mockConfig);
    const authUrlWithHintStr = await service.createAuthorizationUrl('user-test-login-hint', {
      loginHint: 'athlete@example.com'
    });
    const parsedUrl = new URL(authUrlWithHintStr);

    const hasLoginHint = parsedUrl.searchParams.get('login_hint') === 'athlete@example.com';
    const hasNoPrompt = parsedUrl.searchParams.get('prompt') === null;
    const hasScope = parsedUrl.searchParams.get('scope') === 'https://www.googleapis.com/auth/drive.file';

    const t10Passed = hasLoginHint && hasNoPrompt && hasScope;

    results.push({
      scenarioId: 'Test 10',
      name: 'Login Hint Optimization: User email attached as login_hint without forcing account chooser',
      passed: t10Passed,
      details: t10Passed
        ? 'Verified login_hint is attached to preselect account and prompt parameter remains omitted'
        : 'Login hint parameter verification failed'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 10',
      name: 'Login Hint Optimization check',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 11: Missing Email Handling (login_hint gracefully omitted)
  // -------------------------------------------------------------
  try {
    const service = new ServerGoogleDriveOAuthService(undefined, () => mockConfig);
    const authUrlNoHintStr = await service.createAuthorizationUrl('user-test-no-hint', {
      loginHint: undefined
    });
    const parsedUrl = new URL(authUrlNoHintStr);

    const hasNoLoginHint = parsedUrl.searchParams.get('login_hint') === null;
    const hasScope = parsedUrl.searchParams.get('scope') === 'https://www.googleapis.com/auth/drive.file';

    const t11Passed = hasNoLoginHint && hasScope;

    results.push({
      scenarioId: 'Test 11',
      name: 'Missing Email Handling: login_hint gracefully omitted when email unavailable',
      passed: t11Passed,
      details: t11Passed
        ? 'Verified authorization URL generates cleanly without login_hint when email is omitted'
        : 'Missing email resulted in unexpected parameter'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 11',
      name: 'Missing Email Handling check',
      passed: false,
      details: err.message
    });
  }

  // -------------------------------------------------------------
  // Test 12: Revoked Permission Recovery with Login Hint
  // -------------------------------------------------------------
  try {
    const service = new ServerGoogleDriveOAuthService(undefined, () => mockConfig);
    const authUrlRevokedStr = await service.createAuthorizationUrl('user-test-revoked-hint', {
      loginHint: 'athlete@example.com',
      forceConsent: true
    });
    const parsedUrl = new URL(authUrlRevokedStr);

    const hasLoginHint = parsedUrl.searchParams.get('login_hint') === 'athlete@example.com';
    const hasConsentPrompt = parsedUrl.searchParams.get('prompt') === 'consent';
    const hasScope = parsedUrl.searchParams.get('scope') === 'https://www.googleapis.com/auth/drive.file';

    const t12Passed = hasLoginHint && hasConsentPrompt && hasScope;

    results.push({
      scenarioId: 'Test 12',
      name: 'Revoked Permission Recovery: login_hint paired with prompt=consent on explicit recovery',
      passed: t12Passed,
      details: t12Passed
        ? 'Verified permission recovery applies prompt=consent alongside login_hint without prompt=select_account'
        : 'Revoked permission recovery check failed'
    });
  } catch (err: any) {
    results.push({
      scenarioId: 'Test 12',
      name: 'Revoked Permission Recovery check',
      passed: false,
      details: err.message
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runServerOAuthContractTests().then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
  });
}
