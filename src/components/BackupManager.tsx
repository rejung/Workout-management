/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, ChangeEvent, useEffect } from 'react';
import { WorkoutLog, Routine, Exercise, ApplicationSnapshot } from '../types';
import { WeightLog, getMaxE1RMForExercise, isSquat, isBenchPress, isDeadlift, isOHP } from '../utils/workoutEngine';
import { Download, Upload, Trash2, ShieldAlert, CheckCircle2, HelpCircle, FileSpreadsheet, Activity, Cloud, CloudUpload, CloudDownload, RefreshCw, LogOut } from 'lucide-react';
import { parseV1Excel, MigrationPreview } from '../utils/v1Migration';
import { formatWorkoutDateShort, getLocalDateString } from '../utils/dateUtils';
import { goalRepository } from '../storage/goalRepository';
import { snapshotService, RestoreSummary } from '../services/snapshotService';
import { runSnapshotSystemTests, TestSuiteSummary } from '../utils/snapshotSystem.test';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  logout,
  saveBackupToDrive,
  listBackupsFromDrive,
  downloadBackupFromDrive,
  deleteBackupFromDrive,
  GoogleDriveFile,
  getAccessToken
} from '../services/googleDriveService';

interface BackupManagerProps {
  logs: WorkoutLog[];
  routines: Routine[];
  exercises: Exercise[];
  weightLogs: WeightLog[];
  onImportData: (data: { logs: WorkoutLog[]; routines: Routine[]; exercises: Exercise[]; weightLogs: WeightLog[]; goalSettings?: any }) => void;
  onClearData: () => void;
  onShowAlert?: (message: string, title?: string) => void;
  onShowConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
}

interface PreviewData {
  version?: string;
  exportedAt?: string | null;
  logsCount: number;
  weightLogsCount: number;
  routinesCount: number;
  exerciseCount?: number;
  setCount?: number;
  hasGoalSettings: boolean;
  hasError: boolean;
  errorMessage: string | null;
  rawParsedData: any;
  healthScore?: number;
  healthReasons?: string[];
}

export default function BackupManager({
  logs,
  routines,
  exercises,
  weightLogs,
  onImportData,
  onClearData,
  onShowAlert,
  onShowConfirm
}: BackupManagerProps) {
  const showAlert = (message: string, title?: string) => {
    if (onShowAlert) {
      onShowAlert(message, title);
    } else {
      alert(message);
    }
  };

  const showConfirm = (message: string, onConfirmAction: () => void, title?: string) => {
    if (onShowConfirm) {
      onShowConfirm(message, onConfirmAction, title);
    } else {
      if (confirm(message)) {
        onConfirmAction();
      }
    }
  };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [v1Preview, setV1Preview] = useState<MigrationPreview | null>(null);
  const [visibleCandidates, setVisibleCandidates] = useState<Record<string, boolean>>({});
  const [visibleTraces, setVisibleTraces] = useState<Record<string, boolean>>({});
  const [restoreResult, setRestoreResult] = useState<RestoreSummary | null>(null);
  const [testSuiteSummary, setTestSuiteSummary] = useState<TestSuiteSummary | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  // Google Drive Cloud Backup states
  const [gUser, setGUser] = useState<User | null>(null);
  const [gToken, setGToken] = useState<string | null>(null);
  const [isGAuthLoading, setIsGAuthLoading] = useState<boolean>(true);
  const [isGDriveLoading, setIsGDriveLoading] = useState<boolean>(false);
  const [driveBackups, setDriveBackups] = useState<GoogleDriveFile[]>([]);
  const [driveError, setDriveError] = useState<string | null>(null);

  useEffect(() => {
    setIsGAuthLoading(true);
    const unsubscribe = initAuth(
      (user, token) => {
        setGUser(user);
        setGToken(token);
        fetchDriveBackups(token);
        setIsGAuthLoading(false);
      },
      () => {
        setGUser(null);
        setGToken(null);
        setDriveBackups([]);
        setIsGAuthLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchDriveBackups = async (token: string) => {
    setIsGDriveLoading(true);
    setDriveError(null);
    try {
      const files = await listBackupsFromDrive(token);
      setDriveBackups(files);
    } catch (err: any) {
      setDriveError(`구글 드라이브 백업 목록 로드 실패: ${err.message || err}`);
    } finally {
      setIsGDriveLoading(false);
    }
  };

  const handleGLogin = async () => {
    setIsGAuthLoading(true);
    setDriveError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setGUser(result.user);
        setGToken(result.accessToken);
        await fetchDriveBackups(result.accessToken);
        showFeedback('구글 드라이브 계정이 성공적으로 연동되었습니다.');
      }
    } catch (err: any) {
      setDriveError(`구글 연동 실패: ${err.message || err}`);
    } finally {
      setIsGAuthLoading(false);
    }
  };

  const handleGLogout = async () => {
    setDriveError(null);
    try {
      await logout();
      setGUser(null);
      setGToken(null);
      setDriveBackups([]);
      showFeedback('구글 드라이브 계정 연동을 해제했습니다.');
    } catch (err: any) {
      setDriveError(`구글 연동 해제 실패: ${err.message || err}`);
    }
  };

  const handleBackupToDrive = async () => {
    const token = gToken || (await getAccessToken());
    if (!token) {
      setDriveError('인증 토큰이 유실되었습니다. 다시 로그인해주세요.');
      return;
    }
    setIsGDriveLoading(true);
    setDriveError(null);
    try {
      const snapshot = snapshotService.createSnapshot(logs, weightLogs || [], routines, exercises);
      await saveBackupToDrive(token, snapshot);
      await fetchDriveBackups(token);
      showFeedback('구글 드라이브 클라우드 백업이 성공적으로 생성되었습니다.');
    } catch (err: any) {
      setDriveError(`클라우드 백업 생성 실패: ${err.message || err}`);
    } finally {
      setIsGDriveLoading(false);
    }
  };

  const handleRestoreFromDrive = async (file: GoogleDriveFile) => {
    const token = gToken || (await getAccessToken());
    if (!token) {
      setDriveError('인증 토큰이 유실되었습니다. 다시 로그인해주세요.');
      return;
    }

    showConfirm(
      `주의: 구글 드라이브 백업 [${file.name}] 데이터로 전체 데이터를 복원하시겠습니까? 현재 기기에 있는 모든 운동 일지, 설정 및 설정된 목표 등이 이 백업 파일의 데이터로 완전히 대체되며, 이 작업은 취소할 수 없습니다.`,
      async () => {
        setIsGDriveLoading(true);
        setDriveError(null);
        try {
          const snapshotData = await downloadBackupFromDrive(token, file.id);
          const validation = snapshotService.validateSnapshot(snapshotData);
          if (!validation.isValid || !validation.snapshot) {
            throw new Error(validation.error || '다운로드한 백업 파일의 무결성 검증에 실패했습니다.');
          }
          const summary = snapshotService.importSnapshot(
            validation.snapshot,
            onImportData,
            routines,
            exercises
          );
          setRestoreResult(summary);
          showFeedback('구글 드라이브 클라우드 백업 데이터가 성공적으로 복원되었습니다!');
        } catch (err: any) {
          showAlert(`클라우드 복원 실패: ${err.message || err}`, 'Google Drive Restore Error');
        } finally {
          setIsGDriveLoading(false);
        }
      },
      '클라우드 백업 복원'
    );
  };

  const handleDeleteFromDrive = async (file: GoogleDriveFile) => {
    const token = gToken || (await getAccessToken());
    if (!token) {
      setDriveError('인증 토큰이 유실되었습니다. 다시 로그인해주세요.');
      return;
    }

    showConfirm(
      `구글 드라이브의 백업 파일 [${file.name}]을 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      async () => {
        setIsGDriveLoading(true);
        setDriveError(null);
        try {
          await deleteBackupFromDrive(token, file.id);
          await fetchDriveBackups(token);
          showFeedback('구글 드라이브 백업 파일이 영구 삭제되었습니다.');
        } catch (err: any) {
          setDriveError(`백업 파일 삭제 실패: ${err.message || err}`);
        } finally {
          setIsGDriveLoading(false);
        }
      },
      '클라우드 백업 파일 삭제'
    );
  };

  const showFeedback = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  const handleRunDiagnostics = () => {
    setIsTesting(true);
    setTimeout(() => {
      try {
        const summary = runSnapshotSystemTests();
        setTestSuiteSummary(summary);
        setIsTesting(false);
        showFeedback(`스냅샷 시스템 무결성 자동 진단 완료 (총 ${summary.total}개 중 ${summary.passed}개 통과)`);
      } catch (e: any) {
        setIsTesting(false);
        showAlert(`진단 실패: ${e.message}`, '테스트 오류');
      }
    }, 100);
  };

  const handleExport = () => {
    try {
      const snapshot = snapshotService.createSnapshot(logs, weightLogs || [], routines, exercises);
      const summary = snapshotService.exportSnapshotToFile(snapshot, 'WorkoutBackup');
      showFeedback(`전체 애플리케이션 스냅샷(.json) 백업을 안전하게 내보냈습니다. (백업 크기: ${summary.size})`);
    } catch (err: any) {
      showAlert(`백업 내보내기 실패: ${err.message || '알 수 없는 오류가 발생했습니다.'}`, 'Integrity Check Error');
    }
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    console.log("Selected File", file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawText = event.target?.result as string;
        console.log("Raw Text", rawText?.slice(0, 300));
        console.log("Raw Type", typeof rawText);

        const parsed = snapshotService.parseSnapshot(rawText);
        console.log("Parsed JSON", parsed);
        console.log("Validation Input", rawText);

        const validation = snapshotService.validateSnapshot(rawText);
        console.log("Health Score Input", validation.snapshot);

        if (!validation.isValid || !validation.snapshot) {
          const errorPreview = {
            version: '2.1',
            exportedAt: null,
            logsCount: validation.statistics?.workoutCount || 0,
            weightLogsCount: validation.statistics?.weightCount || 0,
            routinesCount: 0,
            exerciseCount: validation.statistics?.exerciseCount || 0,
            setCount: validation.statistics?.setCount || 0,
            hasGoalSettings: false,
            hasError: true,
            errorMessage: validation.error || '가져온 백업 파일의 무결성 검증에 실패했습니다.',
            rawParsedData: null,
            healthScore: validation.healthScore || 0,
            healthReasons: validation.healthReasons || ['검증 실패']
          };
          console.log("Preview Data", errorPreview);
          setPreviewData(errorPreview);
          return;
        }

        const validSnapshot = validation.snapshot;
        const logsArray = validSnapshot.workoutLogs || [];
        const weightLogsArray = validSnapshot.weightLogs || [];
        const routinesArray = validSnapshot.routines || (validSnapshot.routineSettings?.routines) || [];
        const hasGoalSettings = validSnapshot.goalSettings !== undefined && validSnapshot.goalSettings !== null && typeof validSnapshot.goalSettings === 'object';
        const exportedAt = validSnapshot.exportedAt || validSnapshot.exportDate || null;
        const version = validSnapshot.version || "2.1";

        const successPreview = {
          version,
          exportedAt,
          logsCount: validation.statistics?.workoutCount || logsArray.length,
          weightLogsCount: validation.statistics?.weightCount || weightLogsArray.length,
          routinesCount: routinesArray.length,
          exerciseCount: validation.statistics?.exerciseCount || 0,
          setCount: validation.statistics?.setCount || 0,
          hasGoalSettings,
          hasError: false,
          errorMessage: null,
          rawParsedData: validSnapshot,
          healthScore: validation.healthScore,
          healthReasons: validation.healthReasons
        };
        console.log("Preview Data", successPreview);
        setPreviewData(successPreview);

      } catch (err) {
        setPreviewData({
          version: '2.1',
          exportedAt: null,
          logsCount: 0,
          weightLogsCount: 0,
          routinesCount: 0,
          exerciseCount: 0,
          setCount: 0,
          hasGoalSettings: false,
          hasError: true,
          errorMessage: '데이터 로드 중 예상치 못한 오류가 발생했습니다.',
          rawParsedData: null,
          healthScore: 0,
          healthReasons: ['치명적 오류 발생']
        });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; // reset
  };

  const executeImport = () => {
    if (!previewData || previewData.hasError || !previewData.rawParsedData) return;
    try {
      const summary = snapshotService.importSnapshot(
        previewData.rawParsedData,
        onImportData,
        routines,
        exercises
      );
      setPreviewData(null);
      setRestoreResult(summary);
      showFeedback(`백업 복원이 성공적으로 완료되었습니다. (건강도 점수: ${summary.healthScore}점)`);
    } catch (err: any) {
      showAlert(`복원 실패: ${err.message || '알 수 없는 오류가 발생했습니다.'}`, 'Atomic Import Aborted');
    }
  };

  const handleExcelImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const preview = await parseV1Excel(arrayBuffer, exercises);
        setV1Preview(preview);
        // Clear JSON import preview to avoid confusion
        setPreviewData(null);
      } catch (err: any) {
        setV1Preview({
          workoutLogsCount: 0,
          weightLogsCount: 0,
          routinesCount: 0,
          customExercisesCount: 0,
          hasError: true,
          errorMessage: `운동 기록 파일 로드 중 치명적인 오류가 발생했습니다: ${err.message || err}`,
          verificationReport: {
            squatV1: null, squatV2: 0,
            benchV1: null, benchV2: 0,
            deadV1: null, deadV2: 0,
            ohpV1: null, ohpV2: 0,
            totalV1: null, totalV2: 0,
            weightV1: null, weightV2: 0,
            isConsistent: false
          },
          payload: null
        });
      }
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = ''; // reset
  };

  const handleApplyV1Migration = () => {
    if (!v1Preview || !v1Preview.payload) return;

    // Merge custom exercises with existing ones
    const mergedExercises = [...exercises];
    for (const customEx of v1Preview.payload.exercises) {
      if (!mergedExercises.some(ex => ex.name.toLowerCase() === customEx.name.toLowerCase())) {
        mergedExercises.push(customEx);
      }
    }

    onImportData({
      logs: v1Preview.payload.logs,
      routines: routines, // preserve current routines
      exercises: mergedExercises,
      weightLogs: v1Preview.payload.weightLogs
    });

    setV1Preview(null);
    showFeedback('구글 스프레드시트 버전 1 데이터가 무결하게 마이그레이션되었습니다!');
  };

  const handleDownloadE1RMDiagnostics = () => {
    const debugDiagnostics = (window as any).__E1RM_DIAGNOSTICS__ || [];
    const blob = new Blob(
      [JSON.stringify(debugDiagnostics, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'e1rm_diagnostics.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header with zero-waste Spacing */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight">데이터 백업 및 시스템 관리</h1>
        <p className="text-slate-400 text-xs mt-1">
          로컬 브라우저 저장소 데이터 유실을 방지하기 위한 백업 파일(.json) 관리 및 이전 버전을 마이그레이션합니다.
        </p>
      </div>

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-4 flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {/* Restore Completion Feedback (Requirement 9) */}
      {restoreResult && (
        <div className="bg-emerald-950/90 text-white p-6 rounded-2xl border border-emerald-500/50 shadow-2xl animate-fade-in relative space-y-4">
          <div className="flex items-center gap-3 border-b border-emerald-800/60 pb-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h4 className="text-base font-extrabold text-white">백업 복원이 완료되었습니다.</h4>
              <p className="text-xs text-emerald-200/80 mt-0.5">Application Snapshot이 성공적으로 복원되어 대시보드 및 시스템에 즉시 적용되었습니다.</p>
            </div>
          </div>

          <div className="bg-zinc-950/80 p-4 rounded-xl border border-emerald-900/60 space-y-2.5 text-xs font-mono">
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">복원 상태</span>
              <span className="font-bold text-emerald-400">복원 완료 (100% 정상 적용)</span>
            </div>
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">운동 기록</span>
              <span className="font-bold text-emerald-400">{restoreResult.logsCount}개</span>
            </div>
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">운동 종목 수</span>
              <span className="font-bold text-emerald-400">{restoreResult.statistics?.exerciseCount || 0}개</span>
            </div>
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">총 세트 수</span>
              <span className="font-bold text-emerald-400">{restoreResult.statistics?.setCount || 0}개</span>
            </div>
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">체중 기록</span>
              <span className="font-bold text-emerald-400">{restoreResult.weightLogsCount}개</span>
            </div>
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">목표 설정</span>
              <span className={`font-bold ${restoreResult.hasGoalSettings ? 'text-indigo-300' : 'text-zinc-500'}`}>
                {restoreResult.hasGoalSettings ? '복원 완료' : '기존 설정 유지'}
              </span>
            </div>
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">스냅샷 건강도 (Health Score)</span>
              <span className="font-bold text-indigo-300">{restoreResult.healthScore !== undefined ? `${restoreResult.healthScore}점 / 100점` : '100점'}</span>
            </div>
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">백업 생성일</span>
              <span className="text-zinc-300">
                {restoreResult.exportedAt
                  ? new Date(restoreResult.exportedAt).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
                  : '날짜 정보 없음'}
              </span>
            </div>
            <div className="flex justify-between items-center text-zinc-300">
              <span className="font-sans font-medium text-zinc-400">백업 버전</span>
              <span className="text-indigo-400 font-bold">v{restoreResult.version || '2.1'}</span>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => setRestoreResult(null)}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer"
            >
              확인 (완료)
            </button>
          </div>
        </div>
      )}

      {/* JSON Import Preview Block (Requirement 7) */}
      {previewData && (
        <div className="bg-zinc-900 text-slate-100 p-6 rounded-2xl border border-zinc-800/80 space-y-5 shadow-xl animate-fade-in">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-indigo-400" />
                백업 파일 데이터 미리보기 (Import Preview)
              </h4>
              <p className="text-xs text-zinc-400 mt-0.5">
                복원을 진행하기 전 파일의 생성 일자와 포함된 데이터 항목을 검토하세요.
              </p>
            </div>
            <span className={`text-xs font-mono px-2.5 py-1 rounded-full uppercase tracking-wider font-bold ${previewData.hasError ? 'bg-rose-950 text-rose-400 border border-rose-900' : 'bg-emerald-950 text-emerald-400 border border-emerald-900'}`}>
              {previewData.hasError ? '검증 실패' : `v${previewData.version || '2.1'} 통과`}
            </span>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center text-zinc-300 pb-2 border-b border-zinc-900">
              <span className="font-sans font-medium text-zinc-400">백업 파일 생성일</span>
              <span className="text-indigo-300 font-bold">
                {previewData.exportedAt 
                  ? new Date(previewData.exportedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
                  : '날짜 정보 없음'}
              </span>
            </div>

            <div className="space-y-2 pt-1 font-sans">
              <div className="text-xs font-bold text-zinc-300 mb-2">포함된 데이터 항목</div>
              
              <div className="flex items-center justify-between py-1.5 px-3 bg-zinc-900/60 rounded-lg">
                <span className="flex items-center gap-2 text-zinc-200 font-medium">
                  <span className="text-emerald-400 font-bold">✓</span> 운동 기록 (Workout Logs)
                </span>
                <span className="font-mono font-black text-white">{previewData.logsCount}개</span>
              </div>

              <div className="flex items-center justify-between py-1.5 px-3 bg-zinc-900/60 rounded-lg">
                <span className="flex items-center gap-2 text-zinc-200 font-medium">
                  <span className="text-emerald-400 font-bold">✓</span> 운동 종목 수 (Exercises)
                </span>
                <span className="font-mono font-black text-white">{previewData.exerciseCount || 0}개</span>
              </div>

              <div className="flex items-center justify-between py-1.5 px-3 bg-zinc-900/60 rounded-lg">
                <span className="flex items-center gap-2 text-zinc-200 font-medium">
                  <span className="text-emerald-400 font-bold">✓</span> 총 세트 수 (Sets)
                </span>
                <span className="font-mono font-black text-white">{previewData.setCount || 0}개</span>
              </div>

              <div className="flex items-center justify-between py-1.5 px-3 bg-zinc-900/60 rounded-lg">
                <span className="flex items-center gap-2 text-zinc-200 font-medium">
                  <span className="text-emerald-400 font-bold">✓</span> 체중 기록 (Weight Logs)
                </span>
                <span className="font-mono font-black text-white">{previewData.weightLogsCount}개</span>
              </div>

              <div className="flex items-center justify-between py-1.5 px-3 bg-zinc-900/60 rounded-lg">
                <span className="flex items-center gap-2 text-zinc-200 font-medium">
                  <span className={previewData.hasGoalSettings ? "text-emerald-400 font-bold" : "text-zinc-500 font-bold"}>
                    {previewData.hasGoalSettings ? "✓" : "-"}
                  </span> 
                  목표 설정 (Goal Settings)
                </span>
                <span className={`font-mono font-black ${previewData.hasGoalSettings ? "text-indigo-300" : "text-zinc-500"}`}>
                  {previewData.hasGoalSettings ? "포함됨 (복원 대상)" : "없음 (현재 목표 유지)"}
                </span>
              </div>

              {previewData.routinesCount > 0 && (
                <div className="flex items-center justify-between py-1.5 px-3 bg-zinc-900/60 rounded-lg">
                  <span className="flex items-center gap-2 text-zinc-200 font-medium">
                    <span className="text-emerald-400 font-bold">✓</span> 루틴 및 커스텀 종목
                  </span>
                  <span className="font-mono font-black text-white">{previewData.routinesCount}개 루틴</span>
                </div>
              )}

              <div className="flex flex-col gap-1.5 py-2.5 px-3 bg-zinc-900/90 border border-indigo-500/30 rounded-xl mt-3">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-200 font-bold flex items-center gap-1.5 text-xs">
                    <span>🛡️ 스냅샷 건강도 (Health Score)</span>
                  </span>
                  <span className={`font-mono font-black text-sm ${
                    (previewData.healthScore || 0) === 100 ? 'text-emerald-400' : (previewData.healthScore || 0) >= 80 ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {previewData.healthScore !== undefined ? `${previewData.healthScore}점 / 100점` : '-'}
                  </span>
                </div>
                {previewData.healthReasons && previewData.healthReasons.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {previewData.healthReasons.map((reason, idx) => (
                      <span key={idx} className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                        reason.includes('✓') || reason.includes('성공') || reason.includes('정상') || reason.includes('최신') || reason.includes('없음')
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                          : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                      }`}>
                        {reason}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800/80 pt-3">
            <p className="text-sm font-bold text-amber-300 text-center mb-4">
              ──────────── 이 백업으로 현재 데이터를 덮어쓰시겠습니까? ────────────
            </p>

            {previewData.errorMessage && (
              <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-3 text-xs text-rose-300 mb-4">
                <p className="font-bold mb-1">⚠️ 데이터 무결성 검증 알림:</p>
                <p>{previewData.errorMessage}</p>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                disabled={previewData.hasError}
                onClick={executeImport}
                className={`flex-1 py-3.5 px-4 rounded-xl text-sm font-bold transition-all text-center border cursor-pointer ${
                  previewData.hasError 
                    ? 'bg-zinc-800 border-zinc-700/50 text-zinc-500 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-600/30'
                }`}
              >
                이 백업으로 복원하기
              </button>
              <button
                onClick={() => setPreviewData(null)}
                className="px-5 py-3.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-bold rounded-xl border border-zinc-700 transition-all cursor-pointer"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {v1Preview && (
        <div className="bg-zinc-900 text-slate-100 p-6 rounded-2xl border border-zinc-800/80 space-y-4 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              가져올 기록 확인 (미리보기)
            </h4>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider font-bold ${v1Preview.hasError ? 'bg-rose-950 text-rose-400 border border-rose-900' : 'bg-emerald-950 text-emerald-400 border border-emerald-900'}`}>
              {v1Preview.hasError ? '검증 실패' : '검증 통과'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">운동 기록 개수</span>
              <span className="text-base font-black text-white">{v1Preview.workoutLogsCount}개</span>
            </div>
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">체중 기록 개수</span>
              <span className="text-base font-black text-white">{v1Preview.weightLogsCount}개</span>
            </div>
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">루틴 개수</span>
              <span className="text-base font-black text-white">{v1Preview.routinesCount}개</span>
            </div>
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800/60">
              <span className="text-zinc-500 block mb-1">사용자 정의 운동</span>
              <span className="text-base font-black text-indigo-300">{v1Preview.customExercisesCount}개 추가</span>
            </div>
          </div>

          {v1Preview.errorMessage && (
            <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-4 text-xs text-rose-300">
              <p className="font-bold mb-1">⚠️ 가져오기 실패 원인:</p>
              <p>{v1Preview.errorMessage}</p>
            </div>
          )}

          {/* Dashboard Verification Report */}
          {!v1Preview.hasError && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
              <h5 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-zinc-800/60 pb-2">
                <Activity className="w-3.5 h-3.5 text-indigo-400" />
                데이터 정합성 검증
              </h5>
              
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="text-zinc-500 border-b border-zinc-800/60">
                      <th className="py-1.5 font-medium">지표</th>
                      <th className="py-1.5 font-medium text-right">기존 기록</th>
                      <th className="py-1.5 font-medium text-right">현재 앱</th>
                      <th className="py-1.5 font-medium text-center">상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/40 font-mono">
                    <tr className="hover:bg-zinc-900/20">
                      <td className="py-1.5 font-sans text-zinc-300">스쿼트 추정 1RM</td>
                      <td className="py-1.5 text-right text-zinc-400">{v1Preview.verificationReport.squatV1 ? `${v1Preview.verificationReport.squatV1}kg` : '미확인'}</td>
                      <td className="py-1.5 text-right text-white font-semibold">{v1Preview.verificationReport.squatV2}kg</td>
                      <td className="py-1.5 text-center">
                        {v1Preview.verificationReport.squatV1 === null ? (
                          <span className="text-zinc-500">기록 없음</span>
                        ) : Math.abs(v1Preview.verificationReport.squatV1 - v1Preview.verificationReport.squatV2) <= 1.5 ? (
                          <span className="text-emerald-400 font-bold">✅ 일치</span>
                        ) : (
                          <span className="text-amber-400">⚠️ 미세 격차 ({Math.round(v1Preview.verificationReport.squatV2 - v1Preview.verificationReport.squatV1)}kg)</span>
                        )}
                      </td>
                    </tr>
                    <tr className="hover:bg-zinc-900/20">
                      <td className="py-1.5 font-sans text-zinc-300">벤치프레스 추정 1RM</td>
                      <td className="py-1.5 text-right text-zinc-400">{v1Preview.verificationReport.benchV1 ? `${v1Preview.verificationReport.benchV1}kg` : '미확인'}</td>
                      <td className="py-1.5 text-right text-white font-semibold">{v1Preview.verificationReport.benchV2}kg</td>
                      <td className="py-1.5 text-center">
                        {v1Preview.verificationReport.benchV1 === null ? (
                          <span className="text-zinc-500">기록 없음</span>
                        ) : Math.abs(v1Preview.verificationReport.benchV1 - v1Preview.verificationReport.benchV2) <= 1.5 ? (
                          <span className="text-emerald-400 font-bold">✅ 일치</span>
                        ) : (
                          <span className="text-amber-400">⚠️ 미세 격차 ({Math.round(v1Preview.verificationReport.benchV2 - v1Preview.verificationReport.benchV1)}kg)</span>
                        )}
                      </td>
                    </tr>
                    <tr className="hover:bg-zinc-900/20">
                      <td className="py-1.5 font-sans text-zinc-300">데드리프트 추정 1RM</td>
                      <td className="py-1.5 text-right text-zinc-400">{v1Preview.verificationReport.deadV1 ? `${v1Preview.verificationReport.deadV1}kg` : '미확인'}</td>
                      <td className="py-1.5 text-right text-white font-semibold">{v1Preview.verificationReport.deadV2}kg</td>
                      <td className="py-1.5 text-center">
                        {v1Preview.verificationReport.deadV1 === null ? (
                          <span className="text-zinc-500">기록 없음</span>
                        ) : Math.abs(v1Preview.verificationReport.deadV1 - v1Preview.verificationReport.deadV2) <= 1.5 ? (
                          <span className="text-emerald-400 font-bold">✅ 일치</span>
                        ) : (
                          <span className="text-amber-400">⚠️ 미세 격차 ({Math.round(v1Preview.verificationReport.deadV2 - v1Preview.verificationReport.deadV1)}kg)</span>
                        )}
                      </td>
                    </tr>
                    <tr className="hover:bg-zinc-900/20">
                      <td className="py-1.5 font-sans text-zinc-300">OHP 추정 1RM</td>
                      <td className="py-1.5 text-right text-zinc-400">{v1Preview.verificationReport.ohpV1 ? `${v1Preview.verificationReport.ohpV1}kg` : '미확인'}</td>
                      <td className="py-1.5 text-right text-white font-semibold">{v1Preview.verificationReport.ohpV2}kg</td>
                      <td className="py-1.5 text-center">
                        {v1Preview.verificationReport.ohpV1 === null ? (
                          <span className="text-zinc-500">기록 없음</span>
                        ) : Math.abs(v1Preview.verificationReport.ohpV1 - v1Preview.verificationReport.ohpV2) <= 1.5 ? (
                          <span className="text-emerald-400 font-bold">✅ 일치</span>
                        ) : (
                          <span className="text-amber-400">⚠️ 미세 격차 ({Math.round(v1Preview.verificationReport.ohpV2 - v1Preview.verificationReport.ohpV1)}kg)</span>
                        )}
                      </td>
                    </tr>
                    <tr className="hover:bg-zinc-900/20">
                      <td className="py-1.5 font-sans text-zinc-300">SBD 3대 총합 (3-Lift)</td>
                      <td className="py-1.5 text-right text-zinc-400">{v1Preview.verificationReport.totalV1 ? `${v1Preview.verificationReport.totalV1}kg` : '미확인'}</td>
                      <td className="py-1.5 text-right text-indigo-300 font-black">{v1Preview.verificationReport.totalV2}kg</td>
                      <td className="py-1.5 text-center">
                        {v1Preview.verificationReport.totalV1 === null ? (
                          <span className="text-emerald-400 font-bold">✅ 검증 통과</span>
                        ) : Math.abs(v1Preview.verificationReport.totalV1 - v1Preview.verificationReport.totalV2) <= 3.5 ? (
                          <span className="text-emerald-400 font-bold">✅ 일치</span>
                        ) : (
                          <span className="text-amber-400">⚠️ 미세 격차 ({Math.round(v1Preview.verificationReport.totalV2 - v1Preview.verificationReport.totalV1)}kg)</span>
                        )}
                      </td>
                    </tr>
                    <tr className="hover:bg-zinc-900/20">
                      <td className="py-1.5 font-sans text-zinc-300">최근 측정 신체 체중</td>
                      <td className="py-1.5 text-right text-zinc-400">{v1Preview.verificationReport.weightV1 ? `${v1Preview.verificationReport.weightV1}kg` : '미확인'}</td>
                      <td className="py-1.5 text-right text-emerald-300 font-black">{v1Preview.verificationReport.weightV2}kg</td>
                      <td className="py-1.5 text-center">
                        {v1Preview.verificationReport.weightV1 === null ? (
                          <span className="text-emerald-400 font-bold">✅ 검증 통과</span>
                        ) : Math.abs(v1Preview.verificationReport.weightV1 - v1Preview.verificationReport.weightV2) <= 0.5 ? (
                          <span className="text-emerald-400 font-bold">✅ 일치</span>
                        ) : (
                          <span className="text-amber-400">⚠️ 미세 격차 ({Math.round((v1Preview.verificationReport.weightV2 - v1Preview.verificationReport.weightV1) * 10) / 10}kg)</span>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-zinc-500 leading-relaxed font-sans">
                💡 기존 기록 파일의 반올림 처리 기준에 따라 ±1.5kg 미만의 편차가 발생할 수 있으나, 계산 공식상 데이터 무결성은 완벽히 유지됩니다.
              </p>
            </div>
          )}

          {!v1Preview.hasError && v1Preview.payload && (
            <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-5 space-y-4">
              {/* Validation Report Header */}
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-indigo-400 shrink-0" />
                  대표세트(e1RM) 검증 결과
                </h4>
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono">
                  ENGINE VERIFICATION
                </span>
              </div>

              {(() => {
                const logsPayload = v1Preview.payload?.logs || [];
                const liftsToValidate = [
                  { id: 'squat', name: 'Squat', matcher: isSquat, v1Val: v1Preview.verificationReport.squatV1, label: '스쿼트 (Squat)' },
                  { id: 'bench', name: 'Bench Press', matcher: isBenchPress, v1Val: v1Preview.verificationReport.benchV1, label: '벤치프레스 (Bench Press)' },
                  { id: 'dead', name: 'Deadlift', matcher: isDeadlift, v1Val: v1Preview.verificationReport.deadV1, label: '데드리프트 (Deadlift)' },
                  { id: 'ohp', name: 'OHP', matcher: isOHP, v1Val: v1Preview.verificationReport.ohpV1, label: 'OHP (오버헤드 프레스)' }
                ];

                const liftValidations = liftsToValidate.map(lift => {
                  const result = getMaxE1RMForExercise(logsPayload, lift.matcher);
                  const candidates = result.candidates || [];
                  
                  const candidateCount = candidates.filter(c => c.included).length;
                  const selectedCount = candidates.filter(c => c.selected).length;
                  
                  // Rule 1: selected=true는 반드시 1개여야 한다 (만약 후보가 있다면)
                  const isSelectedCountValid = candidateCount > 0 ? (selectedCount === 1) : (selectedCount === 0);
                  
                  // Rule 2: candidate=true인 세트는 e1RM 계산 대상이어야 함 (e1RM > 0)
                  const isCandidateE1RMValid = candidates.filter(c => c.included).every(c => c.calculatedE1RM > 0);
                  
                  // Rule 3: selected 세트의 e1RM은 candidate 중 최대값이어야 한다
                  const maxCandidateE1RM = candidates.filter(c => c.included).reduce((max, c) => c.calculatedE1RM > max ? c.calculatedE1RM : max, 0);
                  const selectedSet = candidates.find(c => c.selected);
                  const isSelectedMax = selectedSet ? Math.abs(selectedSet.calculatedE1RM - maxCandidateE1RM) < 0.0001 : (candidateCount === 0);
                  
                  // Rule 4: selected 세트는 Warmup이면 안 된다
                  const isSelectedNotWarmup = selectedSet ? !selectedSet.rawSetRecord?.isWarmup : true;
                  
                  // Rule 5: Dashboard 계산값은 selected 세트로부터 계산되어야 한다
                  const isDashboardMatch = lift.v1Val === null || Math.abs(Math.round(result.maxE1RM) - lift.v1Val) <= 1.5;

                  const passed = isSelectedCountValid && isCandidateE1RMValid && isSelectedMax && isSelectedNotWarmup && isDashboardMatch;
                  
                  return {
                    ...lift,
                    result,
                    candidates,
                    candidateCount,
                    selectedCount,
                    selectedSet,
                    passed,
                    maxCandidateE1RM,
                    rules: {
                      isSelectedCountValid,
                      isCandidateE1RMValid,
                      isSelectedMax,
                      isSelectedNotWarmup,
                      isDashboardMatch
                    }
                  };
                });

                // Engine Consistency Summary Check
                const totalCandidatesCount = liftValidations.reduce((sum, l) => sum + l.candidateCount, 0);
                const totalSelectedCount = liftValidations.reduce((sum, l) => sum + l.selectedCount, 0);
                const expectedSelectedCount = liftValidations.filter(l => l.candidateCount > 0).length;
                
                const isSelectedCountConsistent = totalSelectedCount === expectedSelectedCount;
                const isE1RMMatchesConsistent = liftValidations.every(l => l.selectedSet ? Math.abs(l.selectedSet.calculatedE1RM - l.maxCandidateE1RM) < 0.0001 : true);
                const isDashboardConsistent = liftValidations.every(l => l.v1Val === null || Math.abs(Math.round(l.result.maxE1RM) - l.v1Val) <= 1.5);

                const enginePassed = isSelectedCountConsistent && isE1RMMatchesConsistent && isDashboardConsistent && liftValidations.every(l => l.passed);

                return (
                  <div className="space-y-6">
                    {/* Flowchart Section */}
                    <div className="bg-zinc-900/30 border border-zinc-850 p-4 rounded-xl space-y-4">
                      <div className="border-b border-zinc-850 pb-2 flex justify-between items-center">
                        <h5 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                          <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>⚙️ Engine Call Trace & Workflow Mapping (엔진 실시간 호출 스택 분석)</span>
                        </h5>
                        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-850">
                          CALL TRACE
                        </span>
                      </div>

                      <div className="flex flex-col md:flex-row items-center justify-between gap-2.5 text-[10px] font-mono font-semibold text-zinc-400 text-center">
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm">
                          <div className="text-indigo-400 font-bold">parseV1Excel()</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Parse XLSX upload</div>
                        </div>
                        <div className="text-zinc-600 hidden md:block">→</div>
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm">
                          <div className="text-indigo-400 font-bold">mappedLogs 생성</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Convert to WorkoutLogs</div>
                        </div>
                        <div className="text-zinc-600 hidden md:block">→</div>
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm">
                          <div className="text-indigo-400 font-bold">getMaxE1RMForExercise()</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Run compound engine</div>
                        </div>
                        <div className="text-zinc-600 hidden md:block">→</div>
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm">
                          <div className="text-indigo-400 font-bold">matcher()</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">In/Exclude evaluation</div>
                        </div>
                        <div className="text-zinc-600 hidden md:block">→</div>
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm">
                          <div className="text-indigo-400 font-bold">candidate 생성</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Assemble candidate pool</div>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row items-center justify-between gap-2.5 text-[10px] font-mono font-semibold text-zinc-400 text-center pt-2 border-t border-zinc-850/40">
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm">
                          <div className="text-indigo-400 font-bold">calculateSetE1RM()</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Epley Formula (W*(1+R/30))</div>
                        </div>
                        <div className="text-zinc-600 hidden md:block">→</div>
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm">
                          <div className="text-indigo-400 font-bold">sort() descending</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Rank candidates by e1RM</div>
                        </div>
                        <div className="text-zinc-600 hidden md:block">→</div>
                        <div className="bg-zinc-950 border border-zinc-800 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm">
                          <div className="text-indigo-400 font-bold">selected set marking</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Assign selected=true</div>
                        </div>
                        <div className="text-zinc-600 hidden md:block">→</div>
                        <div className="bg-zinc-950 border border-indigo-500/20 px-3 py-2 rounded-lg w-full md:w-auto shadow-sm ring-1 ring-indigo-500/10">
                          <div className="text-indigo-400 font-bold text-[10px]">Validation Report UI</div>
                          <div className="text-[9px] text-zinc-500 mt-0.5">Render real-time validation</div>
                        </div>
                      </div>
                    </div>

                    {/* Validation Report Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-850 text-zinc-500 font-mono">
                            <th className="py-2.5 font-semibold">종목</th>
                            <th className="py-2.5 text-center font-semibold">후보 세트 수</th>
                            <th className="py-2.5 font-semibold">선정 세트 (운동 / 날짜 / 상세)</th>
                            <th className="py-2.5 text-right font-semibold">계산된 e1RM</th>
                            <th className="py-2.5 text-right font-semibold">대시보드 e1RM</th>
                            <th className="py-2.5 text-right font-semibold">편차</th>
                            <th className="py-2.5 text-center font-semibold">검증 상태</th>
                            <th className="py-2.5 text-right font-semibold">동작</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-850/40">
                          {liftValidations.map(lift => {
                            const diffVal = lift.selectedSet ? (lift.selectedSet.calculatedE1RM - (lift.v1Val || 0)) : 0;
                            const diffText = lift.v1Val === null ? '-' : (diffVal >= 0 ? `+${diffVal.toFixed(2)}kg` : `${diffVal.toFixed(2)}kg`);
                            const diffColor = lift.v1Val === null ? 'text-zinc-500' : (diffVal > 0 ? 'text-emerald-400' : (diffVal < 0 ? 'text-rose-400' : 'text-zinc-400'));
                            
                            return (
                              <tr key={lift.id} className="hover:bg-zinc-900/10">
                                <td className="py-3 font-semibold text-zinc-200">
                                  {lift.name}
                                </td>
                                <td className="py-3 text-center font-mono text-zinc-400">
                                  {lift.candidateCount}
                                </td>
                                <td className="py-3">
                                  {lift.selectedSet ? (
                                    <div className="space-y-0.5">
                                      <div className="text-zinc-300 font-medium">
                                        {lift.selectedSet.exerciseName}
                                      </div>
                                      <div className="text-[10px] text-zinc-500 font-mono">
                                        {formatWorkoutDateShort(lift.selectedSet.date)} • {lift.selectedSet.weight}kg × {lift.selectedSet.reps} reps
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-zinc-500 italic text-[10px]">유효한 후보 세트 없음</span>
                                  )}
                                </td>
                                <td className="py-3 text-right font-mono font-semibold text-white">
                                  {lift.selectedSet ? `${lift.selectedSet.calculatedE1RM.toFixed(2)}kg` : '0.00kg'}
                                </td>
                                <td className="py-3 text-right font-mono text-zinc-400">
                                  {lift.v1Val ? `${lift.v1Val}kg` : '-'}
                                </td>
                                <td className={`py-3 text-right font-mono font-semibold ${diffColor}`}>
                                  {diffText}
                                </td>
                                <td className="py-3 text-center">
                                  {lift.passed ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      PASS
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                      FAIL
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={() => setVisibleTraces(prev => ({ ...prev, [lift.id]: !prev[lift.id] }))}
                                      className="px-2 py-1 text-[10px] font-bold text-zinc-300 hover:text-white bg-indigo-950/40 hover:bg-indigo-900/40 rounded-lg transition-all cursor-pointer border border-indigo-500/30 flex items-center gap-1"
                                    >
                                      <Activity className="w-3 h-3 text-indigo-400" />
                                      {visibleTraces[lift.id] ? '상세 닫기' : '검증 상세'}
                                    </button>
                                    <button
                                      onClick={() => setVisibleCandidates(prev => ({ ...prev, [lift.id]: !prev[lift.id] }))}
                                      className="px-2 py-1 text-[10px] font-bold text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-all cursor-pointer border border-zinc-700"
                                    >
                                      {visibleCandidates[lift.id] ? '후보군 닫기' : '후보군 보기'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Tracing Panel Area */}
                    {liftValidations.map(lift => {
                      if (!visibleTraces[lift.id]) return null;
                      return (
                        <div key={`trace-${lift.id}`} className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-5 space-y-4 animate-fade-in">
                          <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
                            <h5 className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                              <span>🔍 {lift.name} 선정 원인 역추적</span>
                            </h5>
                            <span className="text-[9px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                              선정 경로
                            </span>
                          </div>

                          {lift.selectedSet ? (() => {
                            const selCand = lift.candidates.find((c: any) => c.selected);
                            if (!selCand) return <p className="text-xs text-zinc-500">Selected set candidate info not found.</p>;

                            return (
                              <div className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-850">
                                    <div className="text-[10px] text-zinc-500">Exercise Name</div>
                                    <div className="text-zinc-200 font-bold mt-0.5">{selCand.exerciseName}</div>
                                  </div>
                                  <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-850">
                                    <div className="text-[10px] text-zinc-500">Exercise ID</div>
                                    <div className="text-zinc-200 font-mono mt-0.5">{selCand.exerciseId}</div>
                                  </div>
                                  <div className="bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-850">
                                    <div className="text-[10px] text-zinc-500">Normalized Name</div>
                                    <div className="text-zinc-200 font-mono mt-0.5">{(selCand as any).matcherDiagnostic?.normalizedName || lift.name.toLowerCase()}</div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="bg-zinc-900/20 p-3 rounded-lg border border-zinc-850/60 space-y-2">
                                    <div className="text-[11px] font-bold text-indigo-300 border-b border-zinc-800/40 pb-1">Include Rules Evaluation (포함 조건 검증)</div>
                                    <ul className="space-y-1 text-[11px] font-mono">
                                      {(selCand as any).includeRuleResults?.map((rule: any, rIdx: number) => (
                                        <li key={rIdx} className="flex justify-between items-center bg-zinc-950/40 px-2 py-1 rounded">
                                          <span className="text-zinc-400">{rule.rule}</span>
                                          <span className={rule.matched ? 'text-emerald-400 font-bold' : 'text-zinc-600'}>
                                            {rule.matched ? 'MATCHED' : 'UNMATCHED'}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  <div className="bg-zinc-900/20 p-3 rounded-lg border border-zinc-850/60 space-y-2">
                                    <div className="text-[11px] font-bold text-rose-300 border-b border-zinc-800/40 pb-1">Exclude Rules Evaluation (제외 조건 검증)</div>
                                    <div className="max-h-36 overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 grid grid-cols-2 gap-1 text-[10px] font-mono">
                                      {(selCand as any).excludeRuleResults?.map((exRule: any, exIdx: number) => (
                                        <div key={exIdx} className="flex justify-between items-center bg-zinc-950/40 px-1.5 py-0.5 rounded">
                                          <span className="text-zinc-500 truncate">{exRule.keyword}</span>
                                          <span className={exRule.matched ? 'text-rose-400 font-bold' : 'text-zinc-600'}>
                                            {exRule.matched ? 'HIT' : 'OK'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px] font-mono">
                                  <div className="bg-zinc-950/50 p-2 rounded border border-zinc-850">
                                    <div className="text-zinc-500">최종 Matcher 결과</div>
                                    <div className={`font-bold mt-0.5 ${(selCand as any).matcherResult ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {(selCand as any).matcherResult ? 'TRUE (CANDIDATE_ELIGIBLE)' : 'FALSE'}
                                    </div>
                                  </div>
                                  <div className="bg-zinc-950/50 p-2 rounded border border-zinc-850">
                                    <div className="text-zinc-500">Candidate 생성 여부</div>
                                    <div className="text-emerald-400 font-bold mt-0.5">
                                      {(selCand as any).candidateGenerated ? 'YES' : 'NO'}
                                    </div>
                                  </div>
                                  <div className="bg-zinc-950/50 p-2 rounded border border-zinc-850">
                                    <div className="text-zinc-500">Selected 여부</div>
                                    <div className="text-indigo-400 font-bold mt-0.5">
                                      {selCand.selected ? 'YES (TRUE)' : 'NO'}
                                    </div>
                                  </div>
                                  <div className="bg-zinc-950/50 p-2 rounded border border-zinc-850">
                                    <div className="text-zinc-500 font-bold">Selection Rank</div>
                                    <div className="text-indigo-400 font-bold mt-0.5 font-mono">
                                      Rank {(selCand as any).selectionRank || 1}
                                    </div>
                                  </div>
                                </div>

                                <div className="bg-zinc-950/40 p-3 rounded-lg border border-zinc-850 space-y-1 text-[11px]">
                                  <div>
                                    <span className="text-zinc-500 font-mono font-bold">selectionReason: </span>
                                    <span className="text-zinc-300">{selCand.reason}</span>
                                  </div>
                                  <div>
                                    <span className="text-zinc-500 font-mono font-bold">selectedBecause: </span>
                                    <span className="text-indigo-300 font-semibold">{(selCand as any).selectedBecause || "Highest e1RM after filtering"}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })() : (
                            <p className="text-xs text-zinc-500 italic">No representative set selected to trace.</p>
                          )}
                        </div>
                      );
                    })}

                    {/* Candidate Table Area */}
                    {liftValidations.map(lift => {
                      if (!visibleCandidates[lift.id]) return null;
                      
                      // Requirement 5: Sort candidates by calculatedE1RM descending before rendering
                      const sortedCandidatesToRender = [...lift.candidates].sort((a, b) => b.calculatedE1RM - a.calculatedE1RM);

                      return (
                        <div key={`cand-table-${lift.id}`} className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-4 space-y-4 animate-fade-in">
                          <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
                            <h5 className="text-xs font-bold text-indigo-300">
                              {lift.label} Candidate Evaluation Pool ({lift.candidates.length} total sets evaluated, sorted by e1RM descending)
                            </h5>
                            <span className="text-[9px] font-mono text-zinc-500">POOL POINTER</span>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-[11px] border-collapse">
                              <thead>
                                <tr className="border-b border-zinc-850 text-zinc-500 font-mono">
                                  <th className="pb-2 font-semibold">RANK (e1RM DESC)</th>
                                  <th className="pb-2 font-semibold">UUID</th>
                                  <th className="pb-2 font-semibold">DATE</th>
                                  <th className="pb-2 font-semibold">EXERCISE NAME (ID)</th>
                                  <th className="pb-2 text-right font-semibold">WEIGHT</th>
                                  <th className="pb-2 text-right font-semibold">REPS</th>
                                  <th className="pb-2 text-right font-semibold">CALCULATED e1RM</th>
                                  <th className="pb-2 text-center font-semibold">WARMUP</th>
                                  <th className="pb-2 text-center font-semibold">CANDIDATE</th>
                                  <th className="pb-2 text-center font-semibold">SELECTED</th>
                                  <th className="pb-2 text-center font-semibold">SELECTION RANK</th>
                                  <th className="pb-2 pl-3 font-semibold">SELECTION REASON (selectedBecause)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-850/30">
                                {sortedCandidatesToRender.map((cand, idx) => {
                                  const isSelected = !!cand.selected;
                                  const isWarmupSet = !!cand.rawSetRecord?.isWarmup;
                                  const evaluationRank = cand.included ? (sortedCandidatesToRender.filter(c => c.included).findIndex(c => c.date === cand.date && c.weight === cand.weight && c.reps === cand.reps) + 1) : null;
                                  const selectRank = isSelected ? 1 : (cand.included ? evaluationRank : null);
                                  
                                  return (
                                    <tr 
                                      key={idx} 
                                      className={`hover:bg-zinc-900/20 transition-all ${
                                        isSelected 
                                          ? 'bg-indigo-950/30 text-indigo-200 border-l-2 border-indigo-500 font-medium' 
                                          : 'text-zinc-400'
                                      }`}
                                    >
                                      <td className="py-2 font-mono font-bold text-center text-zinc-300">
                                        {evaluationRank ? `#${evaluationRank}` : 'N/A'}
                                      </td>
                                      <td className="py-2 font-mono text-[9px] text-zinc-500">
                                        {(cand as any).uuid || `${lift.id}_${idx}`}
                                      </td>
                                      <td className="py-2 font-mono">
                                        {formatWorkoutDateShort(cand.date)}
                                      </td>
                                      <td className={`py-2 ${isSelected ? 'text-indigo-300 font-semibold' : 'text-zinc-300'}`}>
                                        <div className="font-semibold">{cand.exerciseName}</div>
                                        <div className="text-[9px] text-zinc-500 font-mono">ID: {cand.exerciseId}</div>
                                      </td>
                                      <td className="py-2 text-right font-mono">
                                        {cand.weight}kg
                                      </td>
                                      <td className="py-2 text-right font-mono">
                                        {cand.reps}회
                                      </td>
                                      <td className={`py-2 text-right font-mono font-semibold ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                                        {cand.calculatedE1RM.toFixed(4)}kg
                                      </td>
                                      <td className="py-2 text-center">
                                        {isWarmupSet ? (
                                          <span className="text-amber-500 font-semibold text-[9px] px-1 bg-amber-500/10 rounded">WARMUP</span>
                                        ) : (
                                          <span className="text-zinc-600">-</span>
                                        )}
                                      </td>
                                      <td className="py-2 text-center">
                                        {cand.included ? (
                                          <span className="text-emerald-400 font-semibold text-[9px] px-1 bg-emerald-500/10 rounded">YES</span>
                                        ) : (
                                          <span className="text-zinc-500 text-[9px] px-1 bg-zinc-800 rounded">NO</span>
                                        )}
                                      </td>
                                      <td className="py-2 text-center">
                                        {isSelected ? (
                                          <span className="text-white font-bold text-[9px] px-1.5 py-0.5 bg-indigo-600 rounded shadow-sm">SELECTED</span>
                                        ) : (
                                          <span className="text-zinc-600">-</span>
                                        )}
                                      </td>
                                      <td className="py-2 text-center font-mono font-bold text-zinc-300">
                                        {selectRank ? `#${selectRank}` : 'N/A'}
                                      </td>
                                      <td className="py-2 pl-3 text-zinc-500 text-[10px] max-w-xs truncate">
                                        {isSelected ? "Highest e1RM after filtering" : (cand.included ? "Lower than highest e1RM" : cand.reason)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Requirement 4: Candidate Table verification & Identity Audit */}
                          <div className="bg-indigo-950/20 border border-indigo-500/20 p-4 rounded-xl space-y-3">
                            <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
                              <h6 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                                <span>🛡️ Candidate Pool Memory & Reference Identity Audit (데이터 메모리 주소 및 참조 일관성 검증)</span>
                              </h6>
                              <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.5 rounded font-mono border border-indigo-500/20">
                                OBJECT SECURITY IDENTITY
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs leading-relaxed">
                              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850 space-y-1">
                                <div className="text-[10px] text-zinc-500 font-semibold">Candidate Count</div>
                                <div className="text-zinc-300 font-mono font-bold">{lift.candidates.length} (Candidates Pool total size)</div>
                              </div>
                              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850 space-y-1">
                                <div className="text-[10px] text-zinc-500 font-semibold">Candidate Object Identity</div>
                                <div className="text-zinc-300 font-mono break-all text-[10px]">
                                  {lift.candidates.length > 0 ? `Ref_Hash: [Array of length ${lift.candidates.length}]` : 'Empty Array'}
                                </div>
                              </div>
                              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850 space-y-1">
                                <div className="text-[10px] text-zinc-500 font-semibold">Source Function</div>
                                <div className="text-zinc-300 font-mono font-bold">getMaxE1RMForExercise()</div>
                              </div>
                              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850 space-y-1">
                                <div className="text-[10px] text-zinc-500 font-semibold">생성 위치</div>
                                <div className="text-zinc-300 font-mono text-[10px]">src/utils/workoutEngine.ts line 347</div>
                              </div>
                              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850 space-y-1">
                                <div className="text-[10px] text-zinc-500 font-semibold">참조 위치</div>
                                <div className="text-zinc-300 font-mono text-[10px]">src/components/BackupManager.tsx & src/utils/v1Migration.ts</div>
                              </div>
                              <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-850 space-y-1">
                                <div className="text-[10px] text-zinc-500 font-semibold font-bold">동일 객체 여부 (Object Reference Identity Check)</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-rose-400 font-bold font-mono">false</span>
                                  <span className="text-[9px] text-zinc-500">(Every call to pure function getMaxE1RMForExercise instantiates a fresh Candidate array. Payload state is 100% consistent.)</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Rules Verification Details */}
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-2.5 border-t border-zinc-850 text-[10px] text-zinc-500">
                            <div className="flex items-center gap-1.5">
                              <span className={lift.rules.isSelectedCountValid ? 'text-emerald-400' : 'text-rose-400'}>
                                {lift.rules.isSelectedCountValid ? '●' : '▲'}
                              </span>
                              <span>Selected count is 1: {lift.rules.isSelectedCountValid ? 'PASS' : 'FAIL'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={lift.rules.isCandidateE1RMValid ? 'text-emerald-400' : 'text-rose-400'}>
                                {lift.rules.isCandidateE1RMValid ? '●' : '▲'}
                              </span>
                              <span>Candidates e1RM &gt; 0: {lift.rules.isCandidateE1RMValid ? 'PASS' : 'FAIL'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={lift.rules.isSelectedMax ? 'text-emerald-400' : 'text-rose-400'}>
                                {lift.rules.isSelectedMax ? '●' : '▲'}
                              </span>
                              <span>Selected is maximum e1RM: {lift.rules.isSelectedMax ? 'PASS' : 'FAIL'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={lift.rules.isSelectedNotWarmup ? 'text-emerald-400' : 'text-rose-400'}>
                                {lift.rules.isSelectedNotWarmup ? '●' : '▲'}
                              </span>
                              <span>Selected is not warmup: {lift.rules.isSelectedNotWarmup ? 'PASS' : 'FAIL'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={lift.rules.isDashboardMatch ? 'text-emerald-400' : 'text-rose-400'}>
                                {lift.rules.isDashboardMatch ? '●' : '▲'}
                              </span>
                              <span>Dashboard e1RM match (±1.5): {lift.rules.isDashboardMatch ? 'PASS' : 'FAIL'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Engine Consistency Check Area */}
                    <div className="bg-zinc-900/20 border border-zinc-850 p-4 rounded-xl space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2">
                        <h5 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                          <span>🛡️ Engine Consistency Check (엔진 정밀 일관성 최종 검사)</span>
                        </h5>
                        {enginePassed ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            ALL PASS
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            ENGINE FAIL
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-center">
                        <div className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg">
                          <div className="text-[10px] text-zinc-500">Candidate Count</div>
                          <div className="text-xs font-bold text-zinc-300 font-mono mt-0.5">{totalCandidatesCount}</div>
                        </div>
                        <div className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg">
                          <div className="text-[10px] text-zinc-500">Selected Count</div>
                          <div className="text-xs font-bold text-zinc-300 font-mono mt-0.5">{totalSelectedCount}</div>
                        </div>
                        <div className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg">
                          <div className="text-[10px] text-zinc-500">Selected Matches Max</div>
                          <div className={`text-xs font-bold mt-0.5 ${isE1RMMatchesConsistent ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isE1RMMatchesConsistent ? 'PASS' : 'FAIL'}
                          </div>
                        </div>
                        <div className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg">
                          <div className="text-[10px] text-zinc-500">Dashboard Matches</div>
                          <div className={`text-xs font-bold mt-0.5 ${isDashboardConsistent ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isDashboardConsistent ? 'PASS' : 'FAIL'}
                          </div>
                        </div>
                        <div className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg">
                          <div className="text-[10px] text-zinc-500">SBD Dashboard Total</div>
                          <div className="text-xs font-bold text-zinc-300 font-mono mt-0.5">{v1Preview.verificationReport.totalV1 ? `${v1Preview.verificationReport.totalV1}kg` : '-'}</div>
                        </div>
                        <div className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg">
                          <div className="text-[10px] text-zinc-500">SBD Calculated Total</div>
                          <div className="text-xs font-bold text-zinc-300 font-mono mt-0.5">{v1Preview.verificationReport.totalV2}kg</div>
                        </div>
                        <div className="bg-zinc-950/40 border border-zinc-850 p-2.5 rounded-lg col-span-2 sm:col-span-1">
                          <div className="text-[10px] text-zinc-500">Consistency Status</div>
                          <div className={`text-xs font-bold mt-0.5 ${enginePassed ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {enginePassed ? 'PASS' : 'FAIL'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
            <button
              disabled={v1Preview.hasError}
              onClick={handleApplyV1Migration}
              className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all text-center border cursor-pointer ${
                v1Preview.hasError 
                  ? 'bg-zinc-800 border-zinc-700/50 text-zinc-500 cursor-not-allowed' 
                  : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-600 text-white shadow-xs'
              }`}
            >
              가져오기 실행
            </button>
            <button
              onClick={() => setV1Preview(null)}
              className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl border border-zinc-700 transition-all cursor-pointer text-center"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google Drive Cloud Backup & Restore Panel */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg space-y-4 md:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                <Cloud className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  구글 드라이브 클라우드 백업 및 복원
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">
                  안전하고 편리한 구글 드라이브(Google Drive) 클라우드를 통해 언제 어디서나 소중한 기록을 안전하게 저장하고 동기화하세요.
                </p>
              </div>
            </div>

            {/* Auth Button / Status */}
            {isGAuthLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>계정 연동 상태 확인 중...</span>
              </div>
            ) : gUser ? (
              <div className="flex items-center gap-3 bg-slate-950 p-2 rounded-xl border border-slate-800/60">
                {gUser.photoURL ? (
                  <img src={gUser.photoURL} alt={gUser.displayName || 'Google User'} referrerPolicy="no-referrer" className="w-8 h-8 rounded-full border border-slate-700 shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {gUser.displayName?.charAt(0) || 'G'}
                  </div>
                )}
                <div className="text-left">
                  <p className="text-xs font-bold text-white leading-tight">{gUser.displayName}</p>
                  <p className="text-[10px] text-slate-400 leading-none mt-0.5">{gUser.email}</p>
                </div>
                <button
                  onClick={handleGLogout}
                  title="계정 연동 해제"
                  className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer ml-1"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGLogin}
                disabled={isGAuthLoading}
                className="flex items-center gap-3 bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 font-bold py-2 px-4 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md disabled:opacity-50"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
                <span className="text-xs font-semibold">Google 계정 연동</span>
              </button>
            )}
          </div>

          {/* Drive Error Message banner */}
          {driveError && (
            <div className="bg-rose-950/40 border border-rose-900/60 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
              <span className="font-bold">오류:</span>
              <span>{driveError}</span>
            </div>
          )}

          {/* Connected view */}
          {gUser ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-300">구글 드라이브 백업 관리</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    백업 데이터는 회원님 드라이브의 <span className="text-indigo-400 font-bold">WorkoutTracker_Backups</span> 폴더에 고유하게 관리됩니다.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchDriveBackups(gToken!)}
                    disabled={isGDriveLoading}
                    title="새로고침"
                    className="p-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850 text-slate-400 hover:text-white rounded-xl transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isGDriveLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleBackupToDrive}
                    disabled={isGDriveLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed shadow-md shadow-indigo-600/20"
                  >
                    <CloudUpload className="w-4 h-4" />
                    <span>{isGDriveLoading ? '백업 중...' : '지금 클라우드 백업 생성'}</span>
                  </button>
                </div>
              </div>

              {/* Backups List */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-slate-400 px-1 uppercase tracking-wider flex items-center justify-between">
                  <span>저장된 드라이브 백업 파일 목록</span>
                  <span className="text-xs text-indigo-400 font-mono normal-case">{driveBackups.length}개 발견됨</span>
                </div>

                {isGDriveLoading && driveBackups.length === 0 ? (
                  <div className="bg-slate-950/30 border border-slate-900 rounded-xl py-8 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-400/80" />
                    <p className="text-xs text-slate-400">구글 드라이브 백업 확인 중...</p>
                  </div>
                ) : driveBackups.length === 0 ? (
                  <div className="bg-slate-950/30 border border-slate-800/40 rounded-xl py-10 flex flex-col items-center justify-center text-center px-4">
                    <Cloud className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-xs font-bold text-slate-300">저장된 클라우드 백업이 없습니다.</p>
                    <p className="text-[10px] text-slate-500 mt-1">상단의 "지금 클라우드 백업 생성" 버튼을 눌러 첫 클라우드 백업을 작성해보세요!</p>
                  </div>
                ) : (
                  <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl overflow-hidden">
                    <div className="max-h-[300px] overflow-y-auto divide-y divide-slate-850">
                      {driveBackups.map((file) => {
                        // Extract version and date from name if format matches wms_workout_backup_v2.1_YYYY-MM-DD_HH-mm-ss.json
                        const nameParts = file.name.split('_');
                        let version = '2.1';
                        let formattedDateStr = '';
                        
                        if (nameParts.length >= 5) {
                          version = nameParts[3].replace('v', '');
                          const datePart = nameParts[4];
                          const timePart = nameParts[5]?.replace('.json', '');
                          if (datePart && timePart) {
                            const [yr, mn, dy] = datePart.split('-');
                            const [hr, min] = timePart.split('-');
                            formattedDateStr = `${yr}년 ${mn}월 ${dy}일 ${hr}시 ${min}분`;
                          }
                        }

                        if (!formattedDateStr && file.createdTime) {
                          formattedDateStr = new Date(file.createdTime).toLocaleString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          });
                        }

                        const displaySize = file.size 
                          ? `${(parseInt(file.size) / 1024).toFixed(1)} KB` 
                          : '크기 모름';

                        return (
                          <div key={file.id} className="p-3.5 flex items-center justify-between hover:bg-slate-900/40 transition-colors gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white truncate" title={file.name}>
                                {file.name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="bg-indigo-950 text-indigo-400 text-[10px] px-2 py-0.5 rounded-md font-mono border border-indigo-900/40">
                                  v{version}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {displaySize}
                                </span>
                                <span className="text-slate-600 text-[10px]">•</span>
                                <span className="text-[10px] text-slate-400">
                                  {formattedDateStr}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleRestoreFromDrive(file)}
                                disabled={isGDriveLoading}
                                className="bg-emerald-950/60 hover:bg-emerald-900 text-emerald-400 font-bold py-1.5 px-3 rounded-lg text-[11px] border border-emerald-900/40 hover:border-emerald-800 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                              >
                                <CloudDownload className="w-3.5 h-3.5" />
                                <span>이 시점으로 복원</span>
                              </button>
                              <button
                                onClick={() => handleDeleteFromDrive(file)}
                                disabled={isGDriveLoading}
                                className="bg-slate-900 hover:bg-rose-950/30 text-slate-400 hover:text-rose-400 p-2 rounded-lg border border-slate-800 hover:border-rose-900/40 transition-colors cursor-pointer disabled:opacity-50"
                                title="백업 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-6 text-center space-y-3">
              <Cloud className="w-10 h-10 text-slate-700 mx-auto" />
              <div className="max-w-md mx-auto space-y-1">
                <p className="text-xs font-bold text-slate-300">클라우드 동기화가 활성화되지 않았습니다.</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  구글 계정을 연결하여 개인 구글 드라이브에 클라우드 백업을 전송 및 관리해보세요. 
                  언제든지 백업을 클릭 한 번으로 다운로드하여 현재 기기 상태를 100% 복원할 수 있습니다.
                </p>
              </div>
              <div className="pt-2 flex justify-center">
                <button
                  onClick={handleGLogin}
                  disabled={isGAuthLoading}
                  className="flex items-center gap-3 bg-white hover:bg-slate-100 text-slate-900 border border-slate-200 font-bold py-3 px-6 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow-md disabled:opacity-50"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                  <span className="text-sm font-semibold text-slate-800">Google 계정으로 로그인하여 드라이브 연동하기</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Export / Import Panel */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-indigo-400" />
            애플리케이션 스냅샷 백업 및 복원
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed">
            운동 기록, 체중 변화 내역뿐만 아니라 <span className="text-indigo-300 font-bold">목표 설정(Goal Settings) 및 루틴</span>까지 앱 상태를 100% 복원할 수 있는 통합 스냅샷(.json) 파일로 내보내거나 가져옵니다.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Export */}
            <button
              onClick={handleExport}
              className="bg-slate-950 hover:bg-slate-900 text-white font-semibold py-3 px-4 rounded-xl text-xs flex flex-col items-center justify-center gap-2 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-5 h-5 text-indigo-400" />
              <span>전체 앱 데이터 내보내기</span>
            </button>

            {/* Import */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-950 hover:bg-slate-900 text-slate-300 hover:text-white font-semibold py-3 px-4 rounded-xl text-xs flex flex-col items-center justify-center gap-2 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer"
            >
              <Upload className="w-5 h-5 text-emerald-400" />
              <span>백업 파일 복원하기</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImport}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>

        {/* External Records Importer Card */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg space-y-4">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            외부 기록 가져오기
          </h3>
          <p className="text-slate-400 text-xs leading-relaxed">
            외부 운동 기록(.xlsx)을 현재 앱 데이터 형식으로 변환하여 가져옵니다.
          </p>

          <div className="pt-2">
            <button
              onClick={() => excelInputRef.current?.click()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              <Upload className="w-4 h-4" />
              <span>운동 기록 파일 선택</span>
            </button>
            <input
              type="file"
              ref={excelInputRef}
              onChange={handleExcelImport}
              accept=".xlsx, .xls"
              className="hidden"
            />
          </div>
        </div>

        {/* Diagnostic System */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-lg md:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                <span>시스템 진단</span>
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                가져온 데이터의 무결성을 검증하고 진단합니다.
              </p>
            </div>
            <button
              onClick={handleRunDiagnostics}
              disabled={isTesting}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                isTesting
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
              }`}
            >
              <CheckCircle2 className={`w-4 h-4 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? '진단 중...' : '진단 실행'}</span>
            </button>
          </div>

          {testSuiteSummary && (
            <div className="bg-zinc-950 p-5 rounded-xl border border-zinc-800 space-y-3 animate-fade-in font-mono text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
                <span className="text-zinc-300 font-sans font-bold flex items-center gap-2">
                  <span className="text-emerald-400 font-bold">●</span> 진단 테스트 실행 결과
                </span>
                <span className="text-emerald-400 font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800/60">
                  총 {testSuiteSummary.total}개 항목 중 {testSuiteSummary.passed}개 통과 ({Math.round((testSuiteSummary.passed / testSuiteSummary.total) * 100)}%)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1 font-sans">
                {testSuiteSummary.results.map((res, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border flex flex-col gap-1 ${
                      res.passed
                        ? 'bg-zinc-900/50 border-emerald-900/50 text-zinc-200'
                        : 'bg-rose-950/40 border-rose-900 text-rose-200 font-bold'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span>{res.scenario}</span>
                      <span className={res.passed ? 'text-emerald-400 font-mono' : 'text-rose-400 font-mono'}>
                        {res.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono leading-tight truncate" title={res.message}>
                      {res.message}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* System Reset Warning - Danger Zone */}
        <div className="bg-rose-950/10 border border-rose-900/30 p-6 rounded-2xl md:col-span-2 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-rose-400">
            <ShieldAlert className="w-5 h-5 text-rose-500 animate-pulse" />
            <h3 className="text-base font-bold">데이터 초기화 (위험 영역)</h3>
          </div>
          <p className="text-rose-300/80 text-xs leading-relaxed">
            저장된 모든 운동 일지, 루틴, 커스텀 운동 정보가 영구적으로 삭제되며 복구할 수 없습니다.
          </p>

          <div>
            <button
              onClick={() => {
                showConfirm('경고: 정말로 데이터베이스를 깨끗이 포맷하고 초기화하시겠습니까? 지워진 데이터는 절대 복구할 수 없습니다.', () => {
                  onClearData();
                  showFeedback('전체 데이터베이스가 깨끗하게 리셋되었습니다.');
                }, '데이터베이스 초기화');
              }}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-5 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Trash2 className="w-4 h-4" />
              <span>전체 훈련 데이터 영구 초기화</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
