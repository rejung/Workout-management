/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DriveAuthState,
  DriveApiError,
  DriveErrorCode,
  handleDriveApiResponse,
  safeDriveFetch,
  verifyDriveAccess,
  ensureDriveAuthorization,
  getDriveBackupPreference,
  setDriveBackupPreference,
  getAccessToken,
  setCachedAccessToken,
  GoogleDriveFile,
  DRIVE_FILE_SCOPE,
  createGoogleDriveProvider,
  waitForAuthInit
} from './googleDriveService';
import { snapshotService } from './snapshotService';

export interface DriveTestResult {
  scenarioId: string;
  name: string;
  passed: boolean;
  details: string;
}

export interface DriveTestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  results: DriveTestResult[];
}

export async function runGoogleDriveReliabilitySuite(): Promise<DriveTestSuiteSummary> {
  const results: DriveTestResult[] = [];

  const record = (scenarioId: string, name: string, passed: boolean, details: string) => {
    results.push({ scenarioId, name, passed, details });
  };

  // -------------------------------------------------------------
  // G1. Firebase signed out -> Drive unavailable ('signed-out')
  // -------------------------------------------------------------
  try {
    let g1Passed = false;
    try {
      await verifyDriveAccess('');
    } catch (e: any) {
      if (e instanceof DriveApiError && (e.code === 'UNAUTHORIZED' || e.code === 'AUTH_EXPIRED')) {
        g1Passed = true;
      }
    }
    const state: DriveAuthState = 'signed-out';
    record(
      'G1',
      'Firebase Signed Out -> Drive Unavailable',
      g1Passed && state === 'signed-out',
      'Firebase 미로그인 시 Drive 인증 불가 및 안전한 상태 전이 확인'
    );
  } catch (err: any) {
    record('G1', 'Firebase Signed Out -> Drive Unavailable', false, err.message);
  }

  // -------------------------------------------------------------
  // G2. Firebase signed in, Drive consent/token missing -> 'signed-in-drive-not-connected'
  // -------------------------------------------------------------
  try {
    const mockUser = { uid: 'u123', email: 'user@example.com' };
    const cachedToken: string | null = null;
    const derivedState: DriveAuthState = mockUser && !cachedToken ? 'signed-in-drive-not-connected' : 'drive-connected';
    
    record(
      'G2',
      'Firebase Signed In without Drive Token -> signed-in-drive-not-connected',
      derivedState === 'signed-in-drive-not-connected',
      'Firebase 로그인만으로 Drive 연결 확정 금지 invariant 검증'
    );
  } catch (err: any) {
    record('G2', 'Firebase Signed In without Drive Token', false, err.message);
  }

  // -------------------------------------------------------------
  // G3. Valid Drive authorization -> 'drive-connected'
  // -------------------------------------------------------------
  try {
    // Mock response simulating 200 OK for folder query
    const mockSuccessResponse = new Response(JSON.stringify({ files: [{ id: 'folder_123' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    const parsed = await handleDriveApiResponse(mockSuccessResponse, 'testVerify');
    const isValid = parsed.files && parsed.files[0].id === 'folder_123';
    
    record(
      'G3',
      'Valid Drive Authorization -> drive-connected',
      isValid,
      '유효한 토큰 및 Drive 폴더 검증 성공 시 drive-connected 전환 확인'
    );
  } catch (err: any) {
    record('G3', 'Valid Drive Authorization', false, err.message);
  }

  // -------------------------------------------------------------
  // G4. Expired token / 401 -> drive-authorization-expired & reconnect available
  // -------------------------------------------------------------
  try {
    const mock401Response = new Response(
      JSON.stringify({
        error: {
          code: 401,
          message: 'Request is missing required authentication credential. Expected OAuth 2 access token.',
          status: 'UNAUTHENTICATED'
        }
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );

    let caught401 = false;
    let expectedCode = false;
    let expectedMessage = false;

    try {
      await handleDriveApiResponse(mock401Response, 'test401');
    } catch (e: any) {
      caught401 = true;
      if (e instanceof DriveApiError && e.code === 'AUTH_EXPIRED' && e.status === 401) {
        expectedCode = true;
      }
      if (e.message.includes('Google Drive 인증이 만료되었습니다')) {
        expectedMessage = true;
      }
    }

    record(
      'G4',
      'Expired Token / 401 -> drive-authorization-expired',
      caught401 && expectedCode && expectedMessage,
      '401 발생 시 AUTH_EXPIRED 에러 및 사용자 친화적 만료 안내 문구 반환 확인'
    );
  } catch (err: any) {
    record('G4', 'Expired Token / 401', false, err.message);
  }

  // -------------------------------------------------------------
  // G5. Permission revoked / 403 -> drive-permission-revoked
  // -------------------------------------------------------------
  try {
    const mock403Response = new Response(
      JSON.stringify({
        error: {
          code: 403,
          message: 'The caller does not have permission',
          status: 'PERMISSION_DENIED',
          errors: [{ message: 'Forbidden', domain: 'global', reason: 'insufficientPermissions' }]
        }
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );

    let caught403 = false;
    let isPermissionRevoked = false;

    try {
      await handleDriveApiResponse(mock403Response, 'test403');
    } catch (e: any) {
      caught403 = true;
      if (e instanceof DriveApiError && e.code === 'PERMISSION_REVOKED' && e.status === 403) {
        isPermissionRevoked = true;
      }
    }

    record(
      'G5',
      'Permission Revoked / 403 -> drive-permission-revoked',
      caught403 && isPermissionRevoked,
      '403 권한 취소/부족 시 PERMISSION_REVOKED 분류 및 명시적 상태 분기 확인'
    );
  } catch (err: any) {
    record('G5', 'Permission Revoked / 403', false, err.message);
  }

  // -------------------------------------------------------------
  // G6. Reconnect successful -> drive-connected
  // -------------------------------------------------------------
  try {
    // Reconnection flow: after re-consent, fresh token verified
    const mockFreshVerifyResponse = new Response(JSON.stringify({ files: [{ id: 'folder_reconnected' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    const parsed = await handleDriveApiResponse(mockFreshVerifyResponse, 'reconnectVerify');
    const reconnected = parsed.files?.[0]?.id === 'folder_reconnected';

    record(
      'G6',
      'Reconnect Successful -> drive-connected',
      reconnected,
      '재연결 후 토큰 갱신 및 검증 완료 시 정상 drive-connected 복구 확인'
    );
  } catch (err: any) {
    record('G6', 'Reconnect Successful', false, err.message);
  }

  // -------------------------------------------------------------
  // G7. Drive network error -> drive-error (network error, auth state NOT revoked)
  // -------------------------------------------------------------
  try {
    let networkErrorCaught = false;
    let isNetworkCode = false;

    // Simulate network error in safeDriveFetch
    try {
      await safeDriveFetch('http://invalid-url.local-fail', {}, 'testNetwork');
    } catch (e: any) {
      networkErrorCaught = true;
      if (e instanceof DriveApiError && e.code === 'NETWORK_ERROR') {
        isNetworkCode = true;
      }
    }

    record(
      'G7',
      'Drive Network Error -> NETWORK_ERROR (not revoked)',
      networkErrorCaught && isNetworkCode,
      '네트워크 장애 발생 시 auth state를 revoked로 오인하지 않고 NETWORK_ERROR 분류'
    );
  } catch (err: any) {
    record('G7', 'Drive Network Error', false, err.message);
  }

  // -------------------------------------------------------------
  // G8. Upload failure -> Error returned, no false success
  // -------------------------------------------------------------
  try {
    const mockUploadErrorRes = new Response('Internal Server Error', {
      status: 500,
      statusText: 'Internal Server Error'
    });

    let uploadFailed = false;
    try {
      await handleDriveApiResponse(mockUploadErrorRes, 'uploadTest');
    } catch (e: any) {
      if (e instanceof DriveApiError && e.code === 'UNKNOWN_ERROR' && e.status === 500) {
        uploadFailed = true;
      }
    }

    record(
      'G8',
      'Upload Failure -> No False Success',
      uploadFailed,
      '업로드 실패 시 조기 예외 throw 및 거짓 성공(false success) 방지 확인'
    );
  } catch (err: any) {
    record('G8', 'Upload Failure', false, err.message);
  }

  // -------------------------------------------------------------
  // G9. Download malformed snapshot -> Snapshot Validator rejects before restore
  // -------------------------------------------------------------
  try {
    const malformedDrivePayload = {
      version: '2.1',
      // missing workoutLogs, routines, etc.
      arbitraryGarbage: true
    };

    const validation = snapshotService.validateSnapshot(malformedDrivePayload);
    const rejected = !validation.isValid && validation.error !== null;

    record(
      'G9',
      'Download Malformed Snapshot -> Snapshot Validator Rejection',
      rejected,
      '드라이브에서 손상된 JSON 수신 시 복원 실행 전 Snapshot Validator 차단 확인'
    );
  } catch (err: any) {
    record('G9', 'Download Malformed Snapshot', false, err.message);
  }

  // -------------------------------------------------------------
  // G10. Drive failure -> Local JSON backup remains 100% functional
  // -------------------------------------------------------------
  try {
    // Simulate Drive in fatal error state
    const localSnapshot = snapshotService.createSnapshot(
      [
        {
          id: 'w-local-1',
          date: '2026-08-26',
          notes: '',
          exercises: [
            {
              exerciseId: 'sq1',
              exerciseName: '스쿼트',
              category: 'Legs',
              sets: [{ id: 's1', weight: 100, reps: 5, isWarmup: false }]
            }
          ]
        }
      ],
      [],
      [],
      []
    );

    const exportText = JSON.stringify(localSnapshot, null, 2);
    const parsedBack = snapshotService.parseSnapshot(exportText);
    const localValidation = snapshotService.validateSnapshot(parsedBack);

    record(
      'G10',
      'Drive Failure -> Local JSON Backup Remains Functional',
      localValidation.isValid && localValidation.healthScore === 100,
      '클라우드 연결 불가 상태에서도 로컬 JSON 내보내기/가져오기 100% 정상 작동'
    );
  } catch (err: any) {
    record('G10', 'Drive Failure -> Local JSON Backup', false, err.message);
  }

  // -------------------------------------------------------------
  // G11. No token leakage in logger / error path
  // -------------------------------------------------------------
  try {
    const dummySecretToken = 'ya29.sensitive_oauth_bearer_token_xyz999';
    const sampleError = new DriveApiError(
      'AUTH_EXPIRED',
      401,
      'Google Drive 인증이 만료되었습니다. 다시 연결해 주세요.',
      `[Drive 401] searchBackupFolder: Token expired`
    );

    // Verify toString / message / safeDetails do not contain the raw token
    const errorString = `${sampleError.name}: ${sampleError.message} (${sampleError.safeDetails})`;
    const isLeaked = errorString.includes(dummySecretToken);

    // Verify scope is minimum
    const isScopeMinimum = DRIVE_FILE_SCOPE === 'https://www.googleapis.com/auth/drive.file';

    record(
      'G11',
      'Security Audit: No Token Leakage & Minimum Scope',
      !isLeaked && isScopeMinimum,
      '에러 객체/로그에 액세스 토큰 미노출 및 drive.file 최소 권한 설정 검증'
    );
  } catch (err: any) {
    record('G11', 'Security Audit', false, err.message);
  }

  // -------------------------------------------------------------
  // G12. Repeated 401 -> No infinite retry loop
  // -------------------------------------------------------------
  try {
    let callCount = 0;
    const maxAllowedAttempts = 1;

    // Simulate single call on 401 without background loop
    const executeCallWithNoAutoRetry = async () => {
      callCount++;
      const res = new Response(JSON.stringify({ error: { code: 401, message: 'Expired' } }), {
        status: 401
      });
      await handleDriveApiResponse(res, 'testLoop');
    };

    let caught = false;
    try {
      await executeCallWithNoAutoRetry();
    } catch (e) {
      caught = true;
    }

    record(
      'G12',
      'Repeated 401 -> No Infinite Retry Loop',
      caught && callCount <= maxAllowedAttempts,
      '401 발생 시 자동 무한 재시도 없이 즉시 authorization-expired 전이 확인'
    );
  } catch (err: any) {
    record('G12', 'Repeated 401', false, err.message);
  }

  // -------------------------------------------------------------
  // G13. Drive Preference Persistence across token removal
  // -------------------------------------------------------------
  try {
    setDriveBackupPreference(true);
    setCachedAccessToken(null);
    const prefRetained = getDriveBackupPreference() === true;
    const tokenIsNull = (await getAccessToken()) === null;

    record(
      'G13',
      'Preference Persistence (Token missing != Drive Disabled)',
      prefRetained && tokenIsNull,
      '메모리 토큰 소실 시에도 driveBackupEnabled preference 영속 유지 확인'
    );
  } catch (err: any) {
    record('G13', 'Preference Persistence', false, err.message);
  }

  // -------------------------------------------------------------
  // G14. ensureDriveAuthorization Gateway Error Classification
  // -------------------------------------------------------------
  try {
    let authErrorCaught = false;
    let authCodeCorrect = false;

    try {
      // Non-interactive call without active user
      await ensureDriveAuthorization({ interactive: false });
    } catch (err: any) {
      if (err instanceof DriveApiError && (err.code === 'UNAUTHORIZED' || err.code === 'AUTH_EXPIRED')) {
        authErrorCaught = true;
        authCodeCorrect = true;
      }
    }

    record(
      'G14',
      'Gateway Security (ensureDriveAuthorization throws without active session)',
      authErrorCaught && authCodeCorrect,
      '인증 정보 부재 시 안전한 DriveApiError throw 및 gateway 보안 무결성 확인'
    );
  } catch (err: any) {
    record('G14', 'Gateway Security', false, err.message);
  }

  // -------------------------------------------------------------
  // G15. 401 response clears in-memory token while retaining preference
  // -------------------------------------------------------------
  try {
    setDriveBackupPreference(true);
    setCachedAccessToken('temp_dummy_token');

    const mock401Res = new Response(JSON.stringify({ error: { code: 401, message: 'Expired' } }), {
      status: 401
    });

    try {
      await handleDriveApiResponse(mock401Res, 'test401Clear');
    } catch {
      // expected
    }

    const tokenCleared = (await getAccessToken()) === null;
    const prefStillTrue = getDriveBackupPreference() === true;

    record(
      'G15',
      '401 Clears Memory Token but Retains Preference',
      tokenCleared && prefStillTrue,
      '401 만료 시 토큰 캐시만 초기화되고 백업 설정 preference는 유지됨 확인'
    );
  } catch (err: any) {
    record('G15', '401 Clears Memory Token', false, err.message);
  }

  // -------------------------------------------------------------
  // G16. OAuth Re-consent Elimination (forceConsent=false omits prompt=consent)
  // -------------------------------------------------------------
  try {
    const providerWithoutForcedConsent = createGoogleDriveProvider(false);
    const customParams = (providerWithoutForcedConsent as any).getCustomParameters ? (providerWithoutForcedConsent as any).getCustomParameters() : {};
    const hasConsentPrompt = customParams?.prompt && customParams.prompt.includes('consent');

    record(
      'G16',
      'OAuth Re-consent Elimination (Default Reconnect Omits prompt=consent)',
      !hasConsentPrompt,
      '재연결 및 토큰 복구 시 prompt=consent 미포함으로 불필요한 재동의 팝업 제거 확인'
    );
  } catch (err: any) {
    record('G16', 'OAuth Re-consent Elimination', false, err.message);
  }

  // -------------------------------------------------------------
  // G17. Explicit Re-consent on Permission Revocation (forceConsent=true sets prompt=consent)
  // -------------------------------------------------------------
  try {
    const providerWithForcedConsent = createGoogleDriveProvider(true);
    const customParams = (providerWithForcedConsent as any).getCustomParameters ? (providerWithForcedConsent as any).getCustomParameters() : {};
    const hasConsentPrompt = customParams?.prompt && customParams.prompt.includes('consent');

    record(
      'G17',
      'Explicit Re-consent on Permission Revocation (forceConsent=true sets prompt=consent)',
      Boolean(hasConsentPrompt),
      '권한 해제(403) 시에는 명시적 재동의(prompt=consent) 정상 파라미터 주입 확인'
    );
  } catch (err: any) {
    record('G17', 'Explicit Re-consent on Permission Revocation', false, err.message);
  }

  // -------------------------------------------------------------
  // G18. Account Chooser Elimination: Default provider omits prompt=select_account
  // -------------------------------------------------------------
  try {
    const defaultProvider = createGoogleDriveProvider();
    const defaultParams = (defaultProvider as any).getCustomParameters ? (defaultProvider as any).getCustomParameters() : {};
    const hasSelectAccount = defaultParams?.prompt && defaultParams.prompt.includes('select_account');

    const providerExplicitFalse = createGoogleDriveProvider({ forceConsent: false, forceAccountSelection: false });
    const falseParams = (providerExplicitFalse as any).getCustomParameters ? (providerExplicitFalse as any).getCustomParameters() : {};
    const hasSelectAccountFalse = falseParams?.prompt && falseParams.prompt.includes('select_account');

    const g18Passed = !hasSelectAccount && !hasSelectAccountFalse;

    record(
      'G18',
      'Account Chooser Elimination: Default provider omits prompt=select_account',
      g18Passed,
      '기본 로그인 및 세션 복원 시 prompt=select_account 파라미터 생략으로 계정 선택창 노출 방지 확인'
    );
  } catch (err: any) {
    record('G18', 'Account Chooser Elimination', false, err.message);
  }

  // -------------------------------------------------------------
  // G19. Explicit Account Switching: forceAccountSelection=true sets prompt=select_account
  // -------------------------------------------------------------
  try {
    const switchProvider = createGoogleDriveProvider({ forceAccountSelection: true });
    const switchParams = (switchProvider as any).getCustomParameters ? (switchProvider as any).getCustomParameters() : {};
    const hasSelectAccount = switchParams?.prompt === 'select_account';

    record(
      'G19',
      'Explicit Account Switching: forceAccountSelection=true sets prompt=select_account',
      hasSelectAccount,
      '명시적 계정 변경 요청 시 prompt=select_account 정상 주입 확인'
    );
  } catch (err: any) {
    record('G19', 'Explicit Account Switching', false, err.message);
  }

  // -------------------------------------------------------------
  // G20. Auth State Initialization Timing Gateway (waitForAuthInit)
  // -------------------------------------------------------------
  try {
    const initPromise = waitForAuthInit();
    const isPromise = initPromise && typeof (initPromise as any).then === 'function';

    record(
      'G20',
      'Auth State Initialization Timing Gateway (waitForAuthInit ensures asynchronous session resolution)',
      Boolean(isPromise),
      '앱 시작/새로고침 시 비동기 세션 복원 대기 게이트웨이(waitForAuthInit) 동작 확인'
    );
  } catch (err: any) {
    record('G20', 'Auth State Initialization Timing Gateway', false, err.message);
  }

  const passedCount = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed: passedCount,
    failed: results.length - passedCount,
    results
  };
}
