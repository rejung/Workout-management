import { useState } from 'react';
import { WorkoutLog, Exercise, SetRecord, LogType } from '../types';
import { formatWorkoutDate } from '../utils/dateUtils';
import { formatTimeSeconds, formatSetRecord, formatSetRecordsList } from '../utils/formatter';
import { extractCardioRecord } from '../domain/cardio';
import { 
  Calendar, 
  Clock, 
  Dumbbell, 
  Layers, 
  Plus, 
  History, 
  Edit2, 
  Trash2, 
  Copy, 
  X, 
  MessageSquare,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Cardio duration parsing helpers
function parseTimeStringToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const parts = timeStr.trim().split(':').map(p => parseInt(p, 10));
  if (parts.some(isNaN)) return null;

  if (parts.length === 3) {
    // HH:MM:SS
    const [hours, minutes, seconds] = parts;
    return hours * 60 + minutes + Math.floor(seconds / 60);
  } else if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts;
    return minutes + Math.floor(seconds / 60);
  } else if (parts.length === 1) {
    // Just minutes or raw number
    return parts[0];
  }
  return null;
}

function getCardioDuration(set: any): string {
  const record = extractCardioRecord(set);
  return formatTimeSeconds(record.timeSeconds);
}

function getCardioDistance(set: any): string {
  const record = extractCardioRecord(set);
  return `${record.distanceKm.toFixed(2)} km`;
}

interface WorkoutHistoryProps {
  logs: WorkoutLog[];
  exercises: Exercise[];
  onEditLog: (log: WorkoutLog) => void;
  onDeleteLog: (id: string) => void;
  onCloneLog: (log: WorkoutLog) => void;
  onShowAlert: (message: string, title?: string) => void;
  onShowConfirm: (message: string, onConfirm: () => void, title?: string) => void;
  onAddWorkoutClick: () => void;
}

export default function WorkoutHistory({
  logs,
  exercises,
  onEditLog,
  onDeleteLog,
  onCloneLog,
  onShowAlert,
  onShowConfirm,
  onAddWorkoutClick
}: WorkoutHistoryProps) {
  const [selectedLog, setSelectedLog] = useState<WorkoutLog | null>(null);

  // Helper to format date into readable Korean format, e.g., 2026.06.26 (금)
  const formatDate = (dateStr: string) => {
    return formatWorkoutDate(dateStr);
  };

  // Helper to resolve canonicalName of exercise if available, fallback to exerciseName
  const getExerciseDisplayName = (exId: string, fallbackName: string) => {
    const cleanId = String(exId || '').trim().toLowerCase();
    const cleanFallback = String(fallbackName || '').trim().toLowerCase();
    
    // 1. Direct match by static map (highest reliability, 100% stable presentation fallback)
    if (cleanId === 'overhead-press' || cleanFallback.includes('overhead press') || cleanFallback.includes('오버헤드 프레스') || cleanId === 'ohp' || cleanFallback === 'ohp') {
      return 'OHP';
    }
    if (cleanId === 'bench-press' || cleanFallback.includes('bench press') || cleanFallback.includes('벤치프레스') || cleanFallback.includes('벤치 프레스')) {
      return '벤치프레스';
    }
    if (cleanId === 'deadlift' || cleanFallback.includes('deadlift') || cleanFallback.includes('데드리프트') || cleanFallback.includes('데드 리프트')) {
      return '데드리프트';
    }
    if (cleanId === 'barbell-row' || cleanFallback.includes('barbell row') || cleanFallback.includes('바벨 로우') || cleanFallback.includes('바벨로우')) {
      return '바벨 로우';
    }
    if (cleanId === 'squat' || cleanFallback.includes('squat') || cleanFallback.includes('스쿼트')) {
      return '스쿼트';
    }

    // 2. Find in exercises list
    const dbEx = exercises.find(e => {
      if (!e) return false;
      const dbId = String(e.id || '').trim().toLowerCase();
      const dbName = String(e.name || '').trim().toLowerCase();
      return dbId === cleanId || dbName === cleanFallback || dbId === cleanFallback || dbName === cleanId;
    });

    if (dbEx && dbEx.canonicalName) {
      return dbEx.canonicalName;
    }

    return fallbackName;
  };

  // Helper to get representative exercise or routine name
  const getSessionTitle = (log: WorkoutLog) => {
    if (log.routineName) {
      return log.routineName;
    }
    if (log.exercises && log.exercises.length > 0) {
      const representative = getExerciseDisplayName(log.exercises[0].exerciseId, log.exercises[0].exerciseName);
      if (log.exercises.length > 1) {
        return `${representative} 외 ${log.exercises.length - 1}개 종목`;
      }
      return representative;
    }
    return '개별 자유 훈련';
  };

  // Calculate stats for a log
  const getLogStats = (log: WorkoutLog) => {
    const exercisesList = log.exercises || [];
    const totalSetsCount = exercisesList.reduce((sum, ex) => {
      if (!ex) return sum;
      const dbEx = exercises.find(e => e && (e.id === ex.exerciseId || e.name === ex.exerciseName));
      const lType = dbEx?.logType || (ex.category === 'Cardio' ? 'CARDIO' : 'STANDARD');
      return lType === 'CARDIO' ? sum : sum + (ex.sets?.length || 0);
    }, 0);
    const isOnlyCardio = exercisesList.length > 0 && exercisesList.every(ex => {
      if (!ex) return false;
      const dbEx = exercises.find(e => e && (e.id === ex.exerciseId || e.name === ex.exerciseName));
      return (dbEx?.logType || (ex.category === 'Cardio' ? 'CARDIO' : 'STANDARD')) === 'CARDIO';
    });
    
    let totalVolume = 0;
    let totalDistance = 0;

    if (isOnlyCardio) {
      totalDistance = exercisesList.reduce((sum, ex) => {
        if (!ex) return sum;
        return sum + (ex.sets || []).reduce((setSum, set) => {
          if (!set) return setSum;
          const s = set as any;
          const dist = s.distanceKm !== undefined && s.distanceKm !== null ? s.distanceKm : (s.weight || 0);
          return setSum + dist;
        }, 0);
      }, 0);
    } else {
      totalVolume = exercisesList.reduce((sum, ex) => {
        if (!ex) return sum;
        const dbEx = exercises.find(e => e && (e.id === ex.exerciseId || e.name === ex.exerciseName));
        const lType = dbEx?.logType || (ex.category === 'Cardio' ? 'CARDIO' : 'STANDARD');
        if (lType === 'CARDIO') return sum;
        return sum + (ex.sets || []).reduce((setSum, set) => {
          if (!set) return setSum;
          return setSum + ((set.weight || 0) * (set.reps || 0));
        }, 0);
      }, 0);
    }

    const exerciseCount = exercisesList.length;
    return {
      totalSetsCount,
      totalVolume,
      totalDistance,
      exerciseCount,
      isOnlyCardio
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">일지</h1>
        </div>
        <button
          onClick={onAddWorkoutClick}
          className="bg-zinc-950 text-white hover:bg-zinc-800 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer min-h-[44px]"
          id="btn-add-history-workout"
        >
          <Plus className="w-4 h-4" />
          운동 추가
        </button>
      </div>

      {/* Logs List Grid / Stack */}
      {logs.length === 0 ? (
        <div className="border border-dashed border-zinc-200 rounded-xl p-12 bg-zinc-50/50 text-center max-w-lg mx-auto mt-6">
          <History className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <p className="text-zinc-700 text-sm font-semibold">저장된 완료 세션이 존재하지 않습니다.</p>
          <p className="text-zinc-400 text-xs mt-1.5 mb-5 leading-relaxed">
            새로운 운동 기록을 작성하여 운동 일지를 시작해 보세요!
          </p>
          <button
            onClick={onAddWorkoutClick}
            className="inline-flex items-center gap-1 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors cursor-pointer min-h-[44px]"
            id="btn-add-first-workout"
          >
            첫 훈련 작성하기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {logs.map((log) => {
            const stats = getLogStats(log);
            return (
              <div
                key={log.id}
                onClick={() => setSelectedLog(log)}
                className="bg-white border border-zinc-200 hover:border-zinc-300 rounded-2xl p-5 transition-all shadow-xs cursor-pointer hover:shadow-md flex flex-col justify-between group relative"
                id={`history-card-${log.id}`}
              >
                {/* Click target helper overlay */}
                <div className="absolute top-4 right-4 text-zinc-400 group-hover:text-zinc-800 transition-colors">
                  <ChevronRight className="w-5 h-5" />
                </div>

                <div className="space-y-4">
                  {/* Date (1) */}
                  <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-medium font-mono">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span>{formatDate(log.date)}</span>
                  </div>

                  {/* Routine Name / Rep Exercise (2) */}
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-zinc-900 group-hover:text-zinc-950 transition-colors pr-6 line-clamp-1">
                      {getSessionTitle(log)}
                    </h3>
                  </div>

                  {/* Stats Grid - Volume/Distance, Exercise Count, Sets Count */}
                  <div className="grid grid-cols-3 gap-3 bg-zinc-50/70 p-3.5 rounded-xl border border-zinc-100/50">
                    {/* Total Volume or Distance */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
                        {stats.isOnlyCardio ? '총 거리' : '총 볼륨'}
                      </span>
                      <div className="flex items-center gap-1 text-xs font-semibold text-zinc-700">
                        <Dumbbell className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>
                          {stats.isOnlyCardio 
                            ? `${stats.totalDistance.toLocaleString()} km` 
                            : `${stats.totalVolume.toLocaleString()} kg`}
                        </span>
                      </div>
                    </div>

                    {/* Exercise Count */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">운동 종목 수</span>
                      <div className="flex items-center gap-1 text-xs font-semibold text-zinc-700">
                        <Layers className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>{stats.exerciseCount}개 종목</span>
                      </div>
                    </div>

                    {/* Total Sets Count */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">총 세트 수</span>
                      <div className="flex items-center gap-1 text-xs font-semibold text-zinc-700">
                        <Sparkles className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        <span>{stats.totalSetsCount}세트</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Session Actions inside the card footer */}
                <div 
                  className="flex items-center gap-2 mt-4 pt-3 border-t border-zinc-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onEditLog(log)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-xs font-bold py-2 px-3 rounded-lg transition-colors cursor-pointer min-h-[40px]"
                    id={`btn-edit-${log.id}`}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    수정
                  </button>
                  <button
                    onClick={() => onCloneLog(log)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors cursor-pointer min-h-[40px]"
                    id={`btn-clone-${log.id}`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    복사하기
                  </button>
                  <button
                    onClick={() => onDeleteLog(log.id)}
                    className="inline-flex items-center justify-center border border-transparent hover:bg-rose-50 text-rose-600 p-2 rounded-lg transition-colors cursor-pointer min-h-[40px] min-w-[40px]"
                    id={`btn-delete-${log.id}`}
                    title="기록 삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Session Detail Modal Overlay */}
      <AnimatePresence>
        {selectedLog && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs"
            onClick={() => setSelectedLog(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-zinc-200 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              id="session-detail-modal"
            >
              {/* Modal Header */}
              <div className="p-5 border-b border-zinc-100 flex justify-between items-start">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-zinc-500 text-xs font-semibold font-mono">
                    <Calendar className="w-4 h-4 text-zinc-400" />
                    <span>{formatDate(selectedLog.date)}</span>
                    {selectedLog.startTime && (
                      <>
                        <span className="text-zinc-300">|</span>
                        <Clock className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{selectedLog.startTime} 시작</span>
                      </>
                    )}
                  </div>
                  <h2 className="text-lg font-black text-zinc-900 tracking-tight">
                    {selectedLog.routineName || '개별 자유 훈련'}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-800 transition-colors cursor-pointer"
                  id="btn-close-detail"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Content - Scrollable list */}
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Stats row inside detail */}
                <div className="grid grid-cols-3 gap-2 bg-zinc-50 border border-zinc-150 rounded-xl p-3 text-center">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                      {getLogStats(selectedLog).isOnlyCardio ? '총 거리' : '누적 중량'}
                    </span>
                    <span className="text-xs font-extrabold text-zinc-800 font-mono">
                      {getLogStats(selectedLog).isOnlyCardio 
                        ? `${getLogStats(selectedLog).totalDistance.toLocaleString()}km`
                        : `${getLogStats(selectedLog).totalVolume.toLocaleString()}kg`}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">운동 가짓수</span>
                    <span className="text-xs font-extrabold text-zinc-800 font-mono">
                      {selectedLog.exercises.length}개
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">수행 세트</span>
                    <span className="text-xs font-extrabold text-zinc-800 font-mono">
                      {getLogStats(selectedLog).totalSetsCount}세트
                    </span>
                  </div>
                </div>

                {/* Exercises list */}
                <div className="space-y-5">
                  <h3 className="text-xs font-extrabold text-zinc-400 uppercase tracking-wider">세부 수행 내역</h3>
                  {selectedLog.exercises.map((ex, idx) => {
                    // Try to find the exercise guide notes from database
                    const dbExercise = exercises.find(e => e.id === ex.exerciseId || e.name === ex.exerciseName);
                    const logType: LogType = dbExercise?.logType || (ex.category === 'Cardio' ? 'CARDIO' : 'STANDARD');

                    return (
                      <div key={idx} className="border border-zinc-150 rounded-xl overflow-hidden bg-white">
                        {/* Exercise Name and category */}
                        <div className="bg-zinc-50 border-b border-zinc-150 px-4 py-3 flex justify-between items-center">
                          <span className="text-sm font-bold text-zinc-900">{getExerciseDisplayName(ex.exerciseId, ex.exerciseName)}</span>
                          <span className="text-[9px] bg-zinc-900 text-white font-mono font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                            {ex.category}
                          </span>
                        </div>

                        {/* Sets Table */}
                        <div className="p-4">
                          <table className="w-full text-left text-xs font-mono">
                            <thead>
                              <tr className="border-b border-zinc-100 text-[10px] text-zinc-400 uppercase font-semibold">
                                <th className="pb-2 font-semibold">세트</th>
                                {logType === 'CARDIO' && (
                                  <th className="pb-2 font-semibold text-right">거리 (Distance)</th>
                                )}
                                {logType === 'STANDARD' && (
                                  <th className="pb-2 font-semibold text-right">무게 (Weight)</th>
                                )}
                                <th className="pb-2 font-semibold text-right">
                                  {logType === 'CARDIO' || logType === 'TIME_BASED' ? '수행 시간 (Duration)' : '반복 (Reps)'}
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-50">
                              {ex.sets.map((set, setIdx) => {
                                return (
                                  <tr key={set.id} className="text-zinc-800">
                                    <td className="py-2.5 font-medium flex items-center gap-1.5">
                                      <span className="text-zinc-500">
                                        {logType === 'CARDIO' ? '기록' : `SET ${setIdx + 1}`}
                                      </span>
                                      {set.isWarmup && (
                                        <span className="text-[9px] font-sans font-extrabold text-amber-500 bg-amber-50 border border-amber-100 px-1 py-0.5 rounded">
                                          웜업
                                        </span>
                                      )}
                                    </td>
                                    {logType === 'CARDIO' && (
                                      <td className="py-2.5 text-right font-bold text-zinc-900">
                                        {getCardioDistance(set)}
                                      </td>
                                    )}
                                    {logType === 'STANDARD' && (
                                      <td className="py-2.5 text-right font-bold text-zinc-900">
                                        {set.weight} kg
                                      </td>
                                    )}
                                    <td className="py-2.5 text-right font-bold text-zinc-900">
                                      {logType === 'CARDIO' || logType === 'TIME_BASED'
                                        ? getCardioDuration(set)
                                        : `${set.reps}회`}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* Exercise database note, if available */}
                          {dbExercise?.notes && (
                            <div className="mt-3 pt-2.5 border-t border-zinc-100 flex items-start gap-1.5 text-zinc-500 text-[11px] leading-relaxed">
                              <MessageSquare className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-semibold text-zinc-600">기록 노트:</span> {dbExercise.notes}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Session overall Memo */}
                {selectedLog.notes && (
                  <div className="bg-zinc-50 border border-zinc-150 p-4 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      훈련 피드백 메모 (Memo)
                    </span>
                    <p className="text-xs text-zinc-700 leading-relaxed font-sans whitespace-pre-wrap">{selectedLog.notes}</p>
                  </div>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="p-5 border-t border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row gap-3">
                <div className="flex gap-2 w-full sm:w-auto sm:mr-auto">
                  <button
                    onClick={() => {
                      onEditLog(selectedLog);
                      setSelectedLog(null);
                    }}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 border border-zinc-200 hover:bg-zinc-100 bg-white text-zinc-700 text-xs font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer min-h-[44px]"
                    id="btn-modal-edit"
                  >
                    <Edit2 className="w-4 h-4" />
                    수정하기
                  </button>
                  <button
                    onClick={() => {
                      onDeleteLog(selectedLog.id);
                      setSelectedLog(null);
                    }}
                    className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 border border-transparent hover:bg-rose-50 text-rose-600 text-xs font-bold py-2.5 px-4 rounded-xl transition-all cursor-pointer min-h-[44px]"
                    id="btn-modal-delete"
                  >
                    <Trash2 className="w-4 h-4" />
                    삭제하기
                  </button>
                </div>
                
                <button
                  onClick={() => {
                    onCloneLog(selectedLog);
                    setSelectedLog(null);
                  }}
                  className="w-full sm:w-auto bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold py-2.5 px-5 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer min-h-[44px]"
                  id="btn-modal-clone"
                >
                  <Copy className="w-4 h-4" />
                  오늘의 훈련으로 복사
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
