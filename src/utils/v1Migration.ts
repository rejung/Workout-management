/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import { WorkoutLog, Routine, Exercise, ExerciseSession, SetRecord, MuscleCategory } from '../types';
import { 
  calculateSetE1RM, 
  getMaxE1RMForExercise, 
  isSquat, 
  isBenchPress, 
  isDeadlift, 
  isOHP,
  WeightLog
} from './workoutEngine';

export interface MigrationPreview {
  workoutLogsCount: number;
  weightLogsCount: number;
  routinesCount: number;
  customExercisesCount: number;
  hasError: boolean;
  errorMessage: string | null;
  debugLogs?: string[]; // Real-time Parser Console Trace Logs
  
  // Dashboard validation details
  verificationReport: {
    squatV1: number | null;
    squatV2: number;
    benchV1: number | null;
    benchV2: number;
    deadV1: number | null;
    deadV2: number;
    ohpV1: number | null;
    ohpV2: number;
    totalV1: number | null;
    totalV2: number;
    weightV1: number | null;
    weightV2: number;
    isConsistent: boolean;
  };

  // Mapped data payloads ready for import
  payload: {
    logs: WorkoutLog[];
    weightLogs: WeightLog[];
    routines: Routine[];
    exercises: Exercise[];
  } | null;
}

// Helper to parse Excel Serial Date (number of days since 1899-12-30) timezone-safely
function parseExcelDate(serial: number): string {
  // Excel epoch is 1899-12-30.
  // Use UTC math to avoid local browser timezone shift issues
  const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Clean and normalize date strings to YYYY-MM-DD
function cleanDateString(raw: string): string {
  // Remove all spaces to handle formats like "2024. 3. 12" -> "2024.3.12"
  const trimmed = raw.trim().replace(/\s+/g, '');
  
  const match = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0');
    const day = match[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Support yy/mm/dd or yy.mm.dd
  const matchShort = trimmed.match(/^(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (matchShort) {
    const year = parseInt(matchShort[1], 10) > 50 ? `19${matchShort[1]}` : `20${matchShort[1]}`;
    const month = matchShort[2].padStart(2, '0');
    const day = matchShort[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return trimmed;
}

// Safely clean and extract numeric values near labels (resolving issues with 1RM/3대/세트 units)
function cleanMetricValue(val: any): number | null {
  if (val === undefined || val === null || val === '') return null;
  
  if (typeof val === 'number') {
    if (val > 1) return val;
    return null;
  }

  let str = String(val).trim().toLowerCase();
  
  // Remove known labels/units that contain numbers to avoid false positive matches
  str = str.replace(/1\s*rm/g, '');
  str = str.replace(/3\s*대/g, '');
  str = str.replace(/3\s*lift/g, '');
  str = str.replace(/4\s*주/g, '');
  str = str.replace(/8\s*주/g, '');
  str = str.replace(/\d+\s*세트/g, ''); // remove "X세트"
  str = str.replace(/\d+\s*회/g, '');   // remove "X회"

  const match = str.match(/([0-9.]+)/);
  if (match) {
    const num = parseFloat(match[1]);
    if (!isNaN(num) && num > 1) {
      return num;
    }
  }

  return null;
}

// Check if a parsed cell is a valid exercise name and not a dashboard element or a table subtitle
function isValidExerciseName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > 25) return false; // Exercise names are short. Long text is usually a note or header card

  // Exclude common dashboard keywords, column headers, or summary words
  const excludePatterns = [
    /최근/i, /지표/i, /합계/i, /평균/i, /목표/i, /대시보드/i, /분석/i,
    /날짜/i, /종목/i, /무게/i, /세트/i, /횟수/i, /총량/i, /볼륨/i, /일자/i,
    /weight/i, /exercise/i, /set/i, /rep/i, /total/i, /volume/i, /average/i,
    /summary/i, /chart/i, /graph/i, /trend/i, /max/i, /min/i, /target/i, /goal/i,
    /중량/i, /반복/i, /시간/i, /거리/i, /비고/i, /memo/i, /note/i, /comment/i,
    /유산소/i, /무산소/i, /기록/i, /달성/i, /수정/i, /등록/i, /삭제/i, /추가/i,
    /버전/i, /version/i, /구글/i, /시트/i, /sheet/i, /스프레드/i
  ];

  for (const pattern of excludePatterns) {
    if (pattern.test(trimmed)) return false;
  }

  // Must not be just a number or symbols
  if (/^[0-9\s!@#$%^&*()_+\-=[\]{};':",./<>?|\\~`]+$/.test(trimmed)) return false;

  return true;
}

// Deduce MuscleCategory from exercise name
function deduceCategory(name: string): MuscleCategory {
  const n = name.toLowerCase();

  // 1. Exception / Specific multi-word mappings
  if (n.includes('레그 컬') || n.includes('레그컬') || n.includes('leg curl')) {
    return 'Legs';
  }
  if (n.includes('레그 익스텐션') || n.includes('레그익스텐션') || n.includes('leg extension')) {
    return 'Legs';
  }
  if (n.includes('카프레이즈') || n.includes('카프 레이즈') || n.includes('calf raise') || n.includes('카프') || n.includes('calf')) {
    return 'Legs';
  }
  if (n.includes('케틀벨 스윙') || n.includes('케틀벨스윙') || n.includes('kettlebell swing') || n.includes('스윙') || n.includes('swing')) {
    return 'Legs';
  }
  if (n.includes('오버헤드 익스텐션') || n.includes('트라이셉스 익스텐션') || n.includes('오버헤드 트라이셉스') || n.includes('삼두 익스텐션') || n.includes('overhead extension') || n.includes('triceps extension')) {
    return 'Arms';
  }
  if (n.includes('페이스풀') || n.includes('페이스 풀') || n.includes('face pull') || n.includes('facepull')) {
    return 'Shoulders';
  }

  // 2. Class/Category-level rules
  if (n.includes('스쿼트') || n.includes('레그') || n.includes('하체') || n.includes('squat') || n.includes('leg') || n.includes('lunge') || n.includes('런지')) {
    return 'Legs';
  }
  if (n.includes('벤치') || n.includes('가슴') || n.includes('체스트') || n.includes('플라이') || n.includes('bench') || n.includes('chest') || n.includes('fly') || n.includes('dips') || n.includes('딥스') || n.includes('푸쉬업') || n.includes('pushup') || n.includes('push-up')) {
    return 'Chest';
  }
  if (n.includes('데드') || n.includes('풀업') || n.includes('로우') || n.includes('렛풀') || n.includes('등') || n.includes('deadlift') || n.includes('pull') || n.includes('row') || n.includes('lat') || n.includes('친업') || n.includes('chinup') || n.includes('chin-up') || n.includes('풀다운') || n.includes('pulldown')) {
    return 'Back';
  }
  if (n.includes('프레스') || n.includes('레이즈') || n.includes('숄더') || n.includes('어깨') || n.includes('overhead') || n.includes('press') || n.includes('lateral') || n.includes('shoulder') || n.includes('ohp') || n.includes('사레레') || n.includes('밀리터리')) {
    return 'Shoulders';
  }
  if (n.includes('컬') || n.includes('트라이셉스') || n.includes('이두') || n.includes('삼두') || n.includes('팔') || n.includes('biceps') || n.includes('triceps') || n.includes('curl') || n.includes('해머')) {
    return 'Arms';
  }
  if (n.includes('플랭크') || n.includes('크런치') || n.includes('복근') || n.includes('코어') || n.includes('plank') || n.includes('crunch') || n.includes('core') || n.includes('행잉')) {
    return 'Core';
  }
  if (n.includes('러닝') || n.includes('달리기') || n.includes('자전거') || n.includes('트레드밀') || n.includes('유산소') || n.includes('run') || n.includes('treadmill') || n.includes('bike') || n.includes('cardio') || n.includes('사이클')) {
    return 'Cardio';
  }

  return 'Chest'; // Fallback
}

// Extract numeric values near labels in a sheet grid
function findValueNearLabel(grid: any[][], labelRegex: RegExp, debugLogs: string[], metricName: string): number | null {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row || !Array.isArray(row)) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').trim();
      if (labelRegex.test(val)) {
        // Candidates around the label cell (prioritize right, then two-right, then down, then left)
        const candidates = [
          { direction: 'right', value: row[c + 1] },
          { direction: 'two-right', value: row[c + 2] },
          { direction: 'down', value: grid[r + 1]?.[c] },
          { direction: 'down-right', value: grid[r + 1]?.[c + 1] },
          { direction: 'left', value: row[c - 1] },
          { direction: 'up', value: grid[r - 1]?.[c] },
        ];
        for (const cand of candidates) {
          const num = cleanMetricValue(cand.value);
          if (num !== null) {
            debugLogs.push(`[Dashboard Checking] FOUND "${metricName}" label ("${val}") at row ${r}, col ${c}. Extracted value ${num} from the cell immediately to the ${cand.direction}.`);
            return num;
          }
        }
      }
    }
  }
  return null;
}

// Find a metric value using an ordered list of search regular expressions (specific to broad)
function findValueByLabels(grid: any[][], regexes: RegExp[], debugLogs: string[], metricName: string): number | null {
  for (const regex of regexes) {
    const val = findValueNearLabel(grid, regex, debugLogs, metricName);
    if (val !== null) {
      return val;
    }
  }
  return null;
}

/**
 * Parses a Version 1 Excel file (.xlsx) and returns a MigrationPreview object.
 */
export async function parseV1Excel(
  fileArrayBuffer: ArrayBuffer,
  existingExercises: Exercise[]
): Promise<MigrationPreview> {
  const debugLogs: string[] = [];
  try {
    debugLogs.push(`[System] Initializing V1 Excel parser...`);
    
    // Parse with cellDates to keep timestamps intact
    const workbook = XLSX.read(fileArrayBuffer, { type: 'array', cellDates: true });
    debugLogs.push(`[Sheet Selection] Total sheets discovered: ${workbook.SheetNames.join(', ')}`);
    
    let rawLogSheet: XLSX.WorkSheet | null = null;
    let weightLogSheet: XLSX.WorkSheet | null = null;
    let dashboardSheet: XLSX.WorkSheet | null = null;

    let rawLogSheetName = '';
    let weightLogSheetName = '';
    let dashboardSheetName = '';

    // Precise sheet matching following requirements
    for (const name of workbook.SheetNames) {
      const lowerName = name.toLowerCase().replace(/\s+/g, '');
      
      const isDashboard = 
        lowerName.includes('dashboard') || 
        lowerName.includes('대시보드') || 
        lowerName.includes('분석') || 
        lowerName.includes('통계') || 
        lowerName.includes('그래프') || 
        lowerName.includes('설정') || 
        lowerName.includes('graph') || 
        lowerName.includes('chart') || 
        lowerName.includes('setting') || 
        lowerName.includes('summary') || 
        lowerName.includes('메인') || 
        lowerName.includes('main');

      if (isDashboard) {
        dashboardSheet = workbook.Sheets[name];
        dashboardSheetName = name;
        continue;
      }

      if (
        lowerName.includes('raw') || 
        lowerName.includes('workout') || 
        lowerName.includes('운동기록') || 
        lowerName.includes('훈련기록') || 
        lowerName.includes('일지') || 
        (lowerName.includes('로그') && !lowerName.includes('체중') && !lowerName.includes('몸무게'))
      ) {
        rawLogSheet = workbook.Sheets[name];
        rawLogSheetName = name;
      } else if (
        lowerName.includes('weight') || 
        lowerName.includes('체중') || 
        lowerName.includes('몸무게')
      ) {
        weightLogSheet = workbook.Sheets[name];
        weightLogSheetName = name;
      }
    }

    // Set fallback raw log sheet if none matches exactly but workbook has sheets
    if (!rawLogSheet && workbook.SheetNames.length > 0) {
      // Find the first sheet that is NOT the dashboard or weight sheet
      for (const name of workbook.SheetNames) {
        if (name !== dashboardSheetName && name !== weightLogSheetName) {
          rawLogSheet = workbook.Sheets[name];
          rawLogSheetName = name;
          break;
        }
      }
    }

    debugLogs.push(`[Sheet Selection] MATCH RESULT -> Raw Workout Sheet: "${rawLogSheetName || 'None'}", Weight Sheet: "${weightLogSheetName || 'None'}", Dashboard Sheet (Validation only): "${dashboardSheetName || 'None'}"`);

    if (!rawLogSheet) {
      debugLogs.push(`[Error] Failed to locate a raw workout logs sheet in the uploaded file.`);
      return {
        workoutLogsCount: 0,
        weightLogsCount: 0,
        routinesCount: 0,
        customExercisesCount: 0,
        hasError: true,
        errorMessage: '엑셀 파일 내에 "운동 기록" (Raw Log Sheet) 시트를 찾을 수 없습니다.',
        verificationReport: createEmptyVerificationReport(),
        payload: null,
        debugLogs
      };
    }

    debugLogs.push(`[Parser] Real import target range: A:I (Columns 0 to 8 only)`);

    // 1. Parse Workout Logs - STRIP everything beyond Column I (index 8) immediately!
    const excelGrid = XLSX.utils.sheet_to_json<any[]>(rawLogSheet, { header: 1 });
    const rawRows = excelGrid.map((row) => {
      if (!Array.isArray(row)) return [];
      // Slicing columns strictly to A:I (indices 0 to 8, length 9)
      return row.slice(0, 9);
    });

    debugLogs.push(`[Parser] Raw rows loaded: ${rawRows.length}`);
    
    // Output the first 20 rows of raw logs restricted to columns A:I
    debugLogs.push(`--- FIRST 20 RAW ROWS IN DETECTED LOG SHEET (RESTRICTED TO COLUMNS A:I) ---`);
    for (let i = 0; i < Math.min(20, rawRows.length); i++) {
      debugLogs.push(`Row #${i} (A:I): ${JSON.stringify(rawRows[i])}`);
    }
    debugLogs.push(`-------------------------------------------------------------------------`);

    let headerRowIndex = -1;
    let dateCol = -1;
    let exerciseCol = -1;
    let weightCol = -1;
    let setsCol = -1;
    let repsCol = -1;
    let distCol = -1;
    let timeCol = -1;

    // Detect headers inside A:I range only
    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;
      
      let score = 0;
      let tempDate = -1;
      let tempEx = -1;
      let tempWeight = -1;
      let tempSets = -1;
      let tempReps = -1;
      let tempDist = -1;
      let tempTime = -1;

      // Scan up to index 8 (Column I)
      for (let j = 0; j < Math.min(row.length, 9); j++) {
        const val = String(row[j] || '').trim().toLowerCase();
        if (/날짜|date|일자/i.test(val)) {
          tempDate = j;
          score++;
        } else if (/종목|운동|exercise|명칭/i.test(val)) {
          tempEx = j;
          score++;
        } else if (/무게|중량|weight|kg/i.test(val)) {
          tempWeight = j;
          score++;
        } else if (/세트|set/i.test(val) && !/반복|횟수/i.test(val)) {
          tempSets = j;
          score++;
        } else if (/반복|rep|횟수/i.test(val)) {
          tempReps = j;
          score++;
        } else if (/거리|distance|러닝거리/i.test(val)) {
          tempDist = j;
        } else if (/시간|time|러닝시간/i.test(val)) {
          tempTime = j;
        }
      }

      if (score >= 3) {
        headerRowIndex = i;
        dateCol = tempDate;
        exerciseCol = tempEx;
        weightCol = tempWeight;
        setsCol = tempSets;
        repsCol = tempReps;
        distCol = tempDist;
        timeCol = tempTime;
        break;
      }
    }

    if (headerRowIndex === -1 || dateCol === -1 || exerciseCol === -1) {
      debugLogs.push(`[Header Detection] Column header row with score >= 3 not found. Falling back to default Standard Column Mapping: A: 날짜(0), B: 종목명(1), C: 무게(2), D: 세트(3), E: 반복(4), F: 거리(5), G: 시간(6)`);
      headerRowIndex = 0; // Fallback start
      dateCol = 0;
      exerciseCol = 1;
      weightCol = 2;
      setsCol = 3;
      repsCol = 4;
      distCol = 5;
      timeCol = 6;
    }

    debugLogs.push(`[Header Detection] COMPLETED! Header Row Index: ${headerRowIndex}. Column Mapping -> Date: col ${dateCol}, Exercise: col ${exerciseCol}, Weight: col ${weightCol}, Sets: col ${setsCol}, Reps: col ${repsCol}, Distance: col ${distCol}, Time: col ${timeCol}`);
    debugLogs.push(`[Parser] Reading data rows starting from row ${headerRowIndex + 1}...`);

    const rawRecords: any[] = [];
    const startIdx = headerRowIndex + 1;
    let lastDateStr = '';

    let skippedEmptyCount = 0;
    let skippedInvalidNameCount = 0;
    let skippedZeroMetricsCount = 0;
    let skippedInvalidDateCount = 0;

    for (let i = startIdx; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) {
        skippedEmptyCount++;
        continue;
      }

      const rawDate = row[dateCol];
      const rawExName = row[exerciseCol];
      
      // Skip empty exercise cells
      if (rawExName === undefined || rawExName === null || String(rawExName).trim() === '') {
        skippedEmptyCount++;
        continue;
      }

      const rawExNameStr = String(rawExName).trim();

      // Screen for valid exercise names (keeps J+ and notes safely out)
      if (!isValidExerciseName(rawExNameStr)) {
        skippedInvalidNameCount++;
        debugLogs.push(`[Parser Row #${i}] Ignored row: Non-exercise/Header pattern matched -> "${rawExNameStr}"`);
        continue;
      }

      // Safe date formatting avoiding timezone shift
      let dateStr = '';
      if (rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== '') {
        if (rawDate instanceof Date) {
          const year = rawDate.getUTCFullYear();
          const month = String(rawDate.getUTCMonth() + 1).padStart(2, '0');
          const day = String(rawDate.getUTCDate()).padStart(2, '0');
          dateStr = `${year}-${month}-${day}`;
        } else if (typeof rawDate === 'number') {
          dateStr = parseExcelDate(rawDate);
        } else {
          dateStr = cleanDateString(String(rawDate));
        }
        if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          lastDateStr = dateStr;
        }
      } else {
        // Fall back to the last encountered date (fill-down)
        dateStr = lastDateStr;
      }

      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        skippedInvalidDateCount++;
        debugLogs.push(`[Parser Row #${i}] Skipped row with exercise "${rawExNameStr}": Could not resolve a valid date.`);
        continue;
      }

      // Safe Extraction of Numbers
      const weightRaw = row[weightCol];
      const setsRaw = row[setsCol];
      const repsRaw = row[repsCol];
      const distRaw = distCol !== -1 ? row[distCol] : undefined;
      const timeRaw = timeCol !== -1 ? row[timeCol] : undefined;

      const weight = parseFloat(String(weightRaw || '0').replace(/[^0-9.]/g, '')) || 0;
      const setsCount = parseInt(String(setsRaw || '0').replace(/[^0-9]/g, ''), 10) || 0;
      const repsCount = parseInt(String(repsRaw || '0').replace(/[^0-9]/g, ''), 10) || 0;
      const distance = parseFloat(String(distRaw || '0').replace(/[^0-9.]/g, '')) || 0;
      const timeStr = timeRaw !== undefined && timeRaw !== null ? String(timeRaw).trim() : '';

      // Skip rows with all-zero/all-empty metrics (spacer rows or blank sections)
      if (weight === 0 && setsCount === 0 && repsCount === 0 && distance === 0 && timeStr === '') {
        skippedZeroMetricsCount++;
        debugLogs.push(`[Parser Row #${i}] Ignored spacer row with exercise "${rawExNameStr}" but zero/empty metrics.`);
        continue;
      }

      // Normalize sets and reps: if logged, they did at least 1 set and 1 rep!
      const finalSets = setsCount || 1;
      const finalReps = repsCount || 1;

      rawRecords.push({
        date: dateStr,
        exerciseName: rawExNameStr,
        weight,
        setsCount: finalSets,
        repsCount: finalReps,
        distance,
        timeStr
      });
    }

    debugLogs.push(`[Parser Summary] Read ${rawRows.length} total rows from Excel.`);
    debugLogs.push(`  ├─ Skipped (Empty Exercise Name): ${skippedEmptyCount}`);
    debugLogs.push(`  ├─ Skipped (Dashboard / Header Label text): ${skippedInvalidNameCount}`);
    debugLogs.push(`  ├─ Skipped (Unresolved Date): ${skippedInvalidDateCount}`);
    debugLogs.push(`  └─ Skipped (Spacer / Zero Metrics Row): ${skippedZeroMetricsCount}`);
    debugLogs.push(`[Parser Summary] Extracted ${rawRecords.length} valid workout records.`);

    if (rawRecords.length === 0) {
      debugLogs.push(`[Error] 0 valid records found in Raw Workout Sheet.`);
      return {
        workoutLogsCount: 0,
        weightLogsCount: 0,
        routinesCount: 0,
        customExercisesCount: 0,
        hasError: true,
        errorMessage: '가져올 유효한 운동 일지 기록 데이터가 존재하지 않습니다.',
        verificationReport: createEmptyVerificationReport(),
        payload: null,
        debugLogs
      };
    }

    // 2. Parse Weight Logs
    const parsedWeightLogs: WeightLog[] = [];
    if (weightLogSheet) {
      debugLogs.push(`[Parser] Parsing Weight Log Sheet: "${weightLogSheetName}"...`);
      const wRows = XLSX.utils.sheet_to_json<any[]>(weightLogSheet, { header: 1 });
      let wHeaderRowIndex = -1;
      let wDateCol = -1;
      let wWeightCol = -1;

      for (let i = 0; i < Math.min(wRows.length, 10); i++) {
        const row = wRows[i];
        if (!row || !Array.isArray(row)) continue;
        let wScore = 0;
        let tempWDate = -1;
        let tempWWeight = -1;

        for (let j = 0; j < row.length; j++) {
          const val = String(row[j] || '').trim().toLowerCase();
          if (/날짜|date|일자/i.test(val)) {
            tempWDate = j;
            wScore++;
          } else if (/체중|몸무게|weight|kg/i.test(val)) {
            tempWWeight = j;
            wScore++;
          }
        }
        if (wScore >= 2) {
          wHeaderRowIndex = i;
          wDateCol = tempWDate;
          wWeightCol = tempWWeight;
          break;
        }
      }

      if (wHeaderRowIndex !== -1 && wDateCol !== -1 && wWeightCol !== -1) {
        debugLogs.push(`[Weight Detection] Header row discovered at index ${wHeaderRowIndex}. Date: col ${wDateCol}, Weight: col ${wWeightCol}`);
        const wStartIdx = wHeaderRowIndex + 1;
        let wLastDateStr = '';
        for (let i = wStartIdx; i < wRows.length; i++) {
          const row = wRows[i];
          if (!row || !Array.isArray(row) || row.length === 0) continue;

          const rawDate = row[wDateCol];
          const rawWeight = row[wWeightCol];
          if (rawWeight === undefined || rawWeight === null || String(rawWeight).trim() === '') continue;

          let dateStr = '';
          if (rawDate !== undefined && rawDate !== null && String(rawDate).trim() !== '') {
            if (rawDate instanceof Date) {
              const year = rawDate.getUTCFullYear();
              const month = String(rawDate.getUTCMonth() + 1).padStart(2, '0');
              const day = String(rawDate.getUTCDate()).padStart(2, '0');
              dateStr = `${year}-${month}-${day}`;
            } else if (typeof rawDate === 'number') {
              dateStr = parseExcelDate(rawDate);
            } else {
              dateStr = cleanDateString(String(rawDate));
            }
            if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
              wLastDateStr = dateStr;
            }
          } else {
            dateStr = wLastDateStr;
          }

          if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

          const weight = parseFloat(String(rawWeight).replace(/[^0-9.]/g, ''));
          if (isNaN(weight) || weight <= 0) continue;

          parsedWeightLogs.push({
            id: `wlog-v1-${dateStr}-${i}`,
            date: dateStr,
            weight: parseFloat(weight.toFixed(2))
          });
        }
        debugLogs.push(`[Parser] Successfully loaded ${parsedWeightLogs.length} bodyweight records.`);
      } else {
        debugLogs.push(`[Weight Detection] Skipped weight sheet parsing. Valid headers (Date, Weight) not found.`);
      }
    }

    // 3. Perform Data Mapping into Version 2 domain structure
    const customExercises: Exercise[] = [];
    const mappedLogs: WorkoutLog[] = [];

    // Group raw log records by Date
    const recordsByDate: Record<string, typeof rawRecords> = {};
    for (const rec of rawRecords) {
      if (!recordsByDate[rec.date]) {
        recordsByDate[rec.date] = [];
      }
      recordsByDate[rec.date].push(rec);
    }

    const sortedDates = Object.keys(recordsByDate).sort((a, b) => b.localeCompare(a));
    debugLogs.push(`[WorkoutLog Creation] Grouped logs into ${sortedDates.length} distinct workout sessions.`);

    let totalSetsCreated = 0;
    let sessionIndex = 0;

    for (const d of sortedDates) {
      sessionIndex++;
      const recs = recordsByDate[d];
      const workoutLogId = `v1-log-${d}-${sessionIndex}`;

      // Group records by exercise name within the date
      const recsByExercise: Record<string, typeof recs> = {};
      for (const r of recs) {
        if (!recsByExercise[r.exerciseName]) {
          recsByExercise[r.exerciseName] = [];
        }
        recsByExercise[r.exerciseName].push(r);
      }

      const exercisesInSession: ExerciseSession[] = [];
      for (const exName in recsByExercise) {
        const exRecs = recsByExercise[exName];

        // Match with existing or previously mapped custom exercises
        let matchedEx = existingExercises.find(ex => {
          const nameClean = ex.name.toLowerCase();
          const targetClean = exName.toLowerCase();
          return (
            nameClean === targetClean ||
            nameClean.includes(`(${targetClean})`) ||
            targetClean.includes(`(${nameClean})`) ||
            nameClean.replace(/\s+/g, '') === targetClean.replace(/\s+/g, '')
          );
        });

        if (!matchedEx) {
          matchedEx = customExercises.find(
            ex => ex.name.toLowerCase() === exName.toLowerCase()
          );
        }

        if (!matchedEx) {
          // Create custom exercise
          const category = deduceCategory(exName);
          matchedEx = {
            id: `v1-custom-${exName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${customExercises.length + 1}`,
            name: exName,
            category,
            isCustom: true
          };
          customExercises.push(matchedEx);
          debugLogs.push(`[Exercise Mapping] "${exName}" -> Created Custom Exercise (Category: ${category})`);
        } else {
          debugLogs.push(`[Exercise Mapping] "${exName}" -> Mapped to existing exercise "${matchedEx.name}" (ID: ${matchedEx.id})`);
        }

        // Generate SetRecords
        const setRecords: SetRecord[] = [];
        let setCounter = 1;
        for (const r of exRecs) {
          // If cardio, the distance is mapped to weight (km) and reps represents time or generic value
          if (matchedEx.category === 'Cardio' && r.distance > 0) {
            setRecords.push({
              id: `v1-set-${workoutLogId}-${matchedEx.id}-${setCounter++}`,
              weight: r.distance, // km representation
              reps: parseInt(r.timeStr.replace(/[^0-9]/g, ''), 10) || 30 // minutes fallback
            });
            totalSetsCreated++;
          } else {
            for (let s = 0; s < r.setsCount; s++) {
              setRecords.push({
                id: `v1-set-${workoutLogId}-${matchedEx.id}-${setCounter++}`,
                weight: r.weight,
                reps: r.repsCount
              });
              totalSetsCreated++;
            }
          }
        }

        // Log set count and volume for validation
        const totalVolume = setRecords.reduce((acc, s) => acc + s.weight * s.reps, 0);
        debugLogs.push(`  └─ Mapped ${setRecords.length} sets for "${matchedEx.name}". Volume: ${totalVolume}kg`);

        exercisesInSession.push({
          exerciseId: matchedEx.id,
          exerciseName: matchedEx.name,
          category: matchedEx.category,
          sets: setRecords
        });
      }

      // ONLY create a session if it has valid exercises and sets
      if (exercisesInSession.length > 0) {
        mappedLogs.push({
          id: workoutLogId,
          date: d,
          startTime: '12:00',
          duration: 60,
          notes: '구글 스프레드시트 버전 1에서 이관된 운동 일지 기록',
          exercises: exercisesInSession
        });
      }
    }

    debugLogs.push(`[Success] WorkoutLog instances successfully prepared. Count: ${mappedLogs.length}`);

    // 4. Verification Check strictly with V1 Dashboard Sheet (isolated entirely!)
    let squatV1: number | null = null;
    let benchV1: number | null = null;
    let deadV1: number | null = null;
    let ohpV1: number | null = null;
    let totalV1: number | null = null;
    let weightV1: number | null = null;

    if (dashboardSheet) {
      debugLogs.push(`[Dashboard Checking] Isolating dashboard checks to Dashboard sheet: "${dashboardSheetName}"...`);
      const dGrid = XLSX.utils.sheet_to_json<any[]>(dashboardSheet, { header: 1 });
      
      squatV1 = findValueByLabels(dGrid, [
        /스쿼트\s*(?:e?1rm|1rm|추정|최대|기록)/i,
        /squat\s*(?:e?1rm|1rm|max)/i,
        /스쿼트/i,
        /squat/i
      ], debugLogs, 'Squat 1RM');
      
      benchV1 = findValueByLabels(dGrid, [
        /벤치\s*프레스\s*(?:e?1rm|1rm|추정|최대|기록)/i,
        /bench\s*press\s*(?:e?1rm|1rm|max)/i,
        /벤치\s*(?:e?1rm|1rm|추정|최대|기록)/i,
        /bench\s*(?:e?1rm|1rm|max)/i,
        /벤치\s*프레스/i,
        /벤치/i,
        /bench\s*press/i
      ], debugLogs, 'Bench Press 1RM');
      
      deadV1 = findValueByLabels(dGrid, [
        /데드리프트\s*(?:e?1rm|1rm|추정|최대|기록)/i,
        /deadlift\s*(?:e?1rm|1rm|max)/i,
        /데드\s*(?:e?1rm|1rm|추정|최대|기록)/i,
        /dead\s*(?:e?1rm|1rm|max)/i,
        /데드리프트/i,
        /데드/i,
        /deadlift/i
      ], debugLogs, 'Deadlift 1RM');
      
      ohpV1 = findValueByLabels(dGrid, [
        /오버헤드\s*(?:프레스)?\s*(?:e?1rm|1rm|추정|최대|기록)/i,
        /ohp\s*(?:e?1rm|1rm|max)/i,
        /overhead\s*(?:press)?\s*(?:e?1rm|1rm|max)/i,
        /오버헤드\s*(?:프레스)?/i,
        /ohp/i,
        /overhead/i
      ], debugLogs, 'OHP 1RM');
      
      totalV1 = findValueByLabels(dGrid, [
        /3대\s*(?:합계|중량|총합|기록)/i,
        /3-?lifts?\s*(?:total|sum)/i,
        /three\s*lifts?\s*(?:total|sum)/i,
        /3대/i
      ], debugLogs, 'SBD Total');
      
      weightV1 = findValueByLabels(dGrid, [
        /최신\s*체중/i,
        /현재\s*체중/i,
        /측정\s*체중/i,
        /체중/i,
        /몸무게/i,
        /body\s*weight/i,
        /weight/i
      ], debugLogs, 'Latest Weight');

      debugLogs.push(`[Dashboard Checking] V1 values loaded -> Squat: ${squatV1 || 'Null'}, Bench: ${benchV1 || 'Null'}, Dead: ${deadV1 || 'Null'}, OHP: ${ohpV1 || 'Null'}, SBD Total: ${totalV1 || 'Null'}, Weight: ${weightV1 || 'Null'}`);
    } else {
      debugLogs.push(`[Dashboard Checking] Skipped. Dedicated dashboard sheet was not detected in this file.`);
    }

    // Calculate Version 2 values based on newly mapped data
    // Detailed Diagnostics Tracing for e1RM representative set selection
    debugLogs.push(`\n================================================================================`);
    debugLogs.push(`[DIAGNOSTICS] DETAILED e1RM REPRESENTATIVE SET SELECTION TRACE`);
    debugLogs.push(`================================================================================`);
    debugLogs.push(`1. FUNCTION CALL PATH:`);
    debugLogs.push(`   parseV1Excel() -> getMaxE1RMForExercise() -> calculateSetE1RM()`);
    debugLogs.push(`   - parseV1Excel() orchestrates migration and extracts mappedWorkoutLogs.`);
    debugLogs.push(`   - getMaxE1RMForExercise() scans all sessions and filters exercises using a matcher.`);
    debugLogs.push(`   - calculateSetE1RM() applies the Epley Formula: e1RM = Weight * (1 + Reps/30).`);
    debugLogs.push(`\n2. EXERCISE MATCHING FOUNDATION & STRATEGY:`);
    debugLogs.push(`   - Squat matcher uses isSquat(id, name). Excludes variations: 스미스, smith, 덤벨, dumbbell, 핵, hack, 점프, jump, 와이드, wide, 스플릿, split, 불가리안, bulgarian, 피스톨, pistol, 런지, lunge, 고블렛, goblet, 하프, half, 프론트, front, 오버헤드, overhead, 싱글, single, 레그, leg.`);
    debugLogs.push(`   - Bench Press matcher uses isBenchPress(id, name). Excludes variations: 인클라인, incline, 디클라인, decline, 덤벨, dumbbell, 스미스, smith, 머신, machine, 체스트, chest, 플라이, fly, 클로즈, close.`);
    debugLogs.push(`   - Deadlift matcher uses isDeadlift(id, name). Excludes variations: 로마니안, 루마니안, romanian, 덤벨, dumbbell, 스모, sumo, 스티프, stiff, 싱글, single, 레그, leg.`);
    debugLogs.push(`   - OHP matcher uses isOHP(id, name). Excludes variations: 덤벨, dumbbell, 머신, machine, 비하인드, behind, 아놀드, arnold, 레이즈, raise, 시티드, seated.`);

    // Run explicit check on user requested exercise names:
    const testNames = ["정지 스쿼트", "스쿼트(PR)", "불가리안 스플릿 스쿼트", "스미스 스쿼트"];
    debugLogs.push(`\n3. SPECIFIC EXERCISE CANDIDACY TEST:`);
    for (const tn of testNames) {
      const matched = isSquat("test-id", tn);
      debugLogs.push(`   - "${tn}": ${matched ? "CANDIDATE (INCLUDED)" : "EXCLUDED"} (Reason: ${matched ? "Matches '스쿼트' or 'squat' without exclusions" : "Contains excluded variation keyword"})`);
    }

    // Diagnostics loop for the four main compound lifts
    const lifts = [
      { name: 'Squat', matcher: isSquat, v1Val: squatV1 },
      { name: 'Bench Press', matcher: isBenchPress, v1Val: benchV1 },
      { name: 'Deadlift', matcher: isDeadlift, v1Val: deadV1 },
      { name: 'OHP', matcher: isOHP, v1Val: ohpV1 }
    ];

    for (const lift of lifts) {
      debugLogs.push(`\n--------------------------------------------------------------------------------`);
      debugLogs.push(`LIFT: ${lift.name} (V1 Dashboard: ${lift.v1Val !== null ? lift.v1Val + 'kg' : 'None'})`);
      debugLogs.push(`--------------------------------------------------------------------------------`);
      debugLogs.push(`[Candidate SetRecords List]`);
      
      let candidatesFoundCount = 0;
      let matchedSetsCount = 0;
      let maxCalculatedE1RM = 0;
      let bestSetText = 'None';
      let bestSetDate = '';
      const candidateList: string[] = [];

      // Find all exercise instances in mappedLogs containing keywords
      for (const log of mappedLogs) {
        for (const ex of log.exercises) {
          const exNameLower = ex.exerciseName.toLowerCase();
          const keywordMatch = 
            (lift.name === 'Squat' && (exNameLower.includes('스쿼트') || exNameLower.includes('squat'))) ||
            (lift.name === 'Bench Press' && (exNameLower.includes('벤치') || exNameLower.includes('bench'))) ||
            (lift.name === 'Deadlift' && (exNameLower.includes('데드') || exNameLower.includes('dead'))) ||
            (lift.name === 'OHP' && (exNameLower.includes('오버헤드') || exNameLower.includes('overhead') || exNameLower.includes('ohp') || exNameLower.includes('밀리터리') || exNameLower.includes('military') || exNameLower.includes('밀프')));

          if (keywordMatch) {
            candidatesFoundCount++;
            const isMatched = lift.matcher(ex.exerciseId, ex.exerciseName);
            
            for (let sIdx = 0; sIdx < ex.sets.length; sIdx++) {
              const set = ex.sets[sIdx];
              const e1rm = calculateSetE1RM(set.weight, set.reps);
              const isWarmup = !!set.isWarmup;
              
              let included = isMatched && !isWarmup;
              let reason = '';
              if (!isMatched) {
                reason = `이름 필터 제외 (메인 운동 변형: "${ex.exerciseName}")`;
              } else if (isWarmup) {
                reason = `웜업 세트 제외`;
              } else {
                reason = `정상 포함`;
                matchedSetsCount++;
                if (e1rm > maxCalculatedE1RM) {
                  maxCalculatedE1RM = e1rm;
                  bestSetText = `${set.weight}kg × ${set.reps}회`;
                  bestSetDate = log.date;
                }
              }

              candidateList.push(` - [${log.date}] ID: ${ex.exerciseId} | Name: "${ex.exerciseName}" | Set #${sIdx + 1} | ${set.weight}kg × ${set.reps} reps | Calculated e1RM: ${e1rm.toFixed(2)}kg | Warmup: ${isWarmup ? "Yes" : "No"} | Selected: ${included ? "YES" : "NO"} (${reason})`);
            }
          }
        }
      }

      // Output first 25 candidates to avoid log bloat, and notify if there are more
      const displayedCandidates = candidateList.slice(0, 25);
      for (const line of displayedCandidates) {
        debugLogs.push(line);
      }
      if (candidateList.length > 25) {
        debugLogs.push(`   ... (Remaining ${candidateList.length - 25} candidates truncated to avoid terminal bloat)`);
      }

      debugLogs.push(`\n[Selection Moment & Decision Log]`);
      debugLogs.push(` - Total Raw Candidate Sets Discovered: ${candidateList.length}`);
      debugLogs.push(` - Total Valid Main Lift Sets Included: ${matchedSetsCount}`);
      if (maxCalculatedE1RM > 0) {
        debugLogs.push(` - Selected Representative Set: ${bestSetText} on ${bestSetDate}`);
        debugLogs.push(` - Final V2 e1RM Value: ${Math.round(maxCalculatedE1RM)}kg (Unrounded: ${maxCalculatedE1RM.toFixed(2)}kg)`);
        debugLogs.push(` - Selection Reason: Highest calculated e1RM value among all non-warmup matched main compound sets.`);
        debugLogs.push(` - Calculation Formula: ${bestSetText.split(' × ')[0]} * (1 + ${bestSetText.split(' × ')[1].replace('회', '')} / 30) = ${maxCalculatedE1RM.toFixed(2)}`);
      } else {
        debugLogs.push(` - No valid main sets found for ${lift.name}. e1RM defaulting to 0.`);
      }
    }
    debugLogs.push(`================================================================================\n`);

    const squatV2 = Math.round(getMaxE1RMForExercise(mappedLogs, isSquat, undefined, undefined, debugLogs).maxE1RM);
    const benchV2 = Math.round(getMaxE1RMForExercise(mappedLogs, isBenchPress, undefined, undefined, debugLogs).maxE1RM);
    const deadV2 = Math.round(getMaxE1RMForExercise(mappedLogs, isDeadlift, undefined, undefined, debugLogs).maxE1RM);
    const ohpV2 = Math.round(getMaxE1RMForExercise(mappedLogs, isOHP, undefined, undefined, debugLogs).maxE1RM);
    const totalV2 = squatV2 + benchV2 + deadV2;

    const sortedWeights = [...parsedWeightLogs].sort((a, b) => b.date.localeCompare(a.date));
    const weightV2 = sortedWeights[0] ? sortedWeights[0].weight : 0;

    debugLogs.push(`[Dashboard Checking] V2 computed values -> Squat: ${squatV2}, Bench: ${benchV2}, Dead: ${deadV2}, OHP: ${ohpV2}, 3-Lift Total: ${totalV2}, Latest Weight: ${weightV2}`);

    // Check consistency
    const isConsistent = 
      (squatV1 === null || Math.abs(squatV1 - squatV2) <= 1.5) &&
      (benchV1 === null || Math.abs(benchV1 - benchV2) <= 1.5) &&
      (deadV1 === null || Math.abs(deadV1 - deadV2) <= 1.5) &&
      (ohpV1 === null || Math.abs(ohpV1 - ohpV2) <= 1.5) &&
      (weightV1 === null || Math.abs(weightV1 - weightV2) <= 0.5);

    debugLogs.push(`[Dashboard Checking] Final Consistency Check Match -> ${isConsistent ? 'SUCCESS' : 'MINOR DEVIATION'}`);

    // Final summary trace
    debugLogs.push(`[Success] Final Migration Payload Ready:`);
    debugLogs.push(`  ├─ Workout Sessions (Logs) Created: ${mappedLogs.length}`);
    debugLogs.push(`  ├─ Custom Exercises Created: ${customExercises.length}`);
    debugLogs.push(`  ├─ Set Records Mapped: ${totalSetsCreated}`);
    debugLogs.push(`  └─ Bodyweight Records Mapped: ${parsedWeightLogs.length}`);

    return {
      workoutLogsCount: mappedLogs.length,
      weightLogsCount: parsedWeightLogs.length,
      routinesCount: 0,
      customExercisesCount: customExercises.length,
      hasError: false,
      errorMessage: null,
      debugLogs,
      verificationReport: {
        squatV1,
        squatV2,
        benchV1,
        benchV2,
        deadV1,
        deadV2,
        ohpV1,
        ohpV2,
        totalV1,
        totalV2,
        weightV1,
        weightV2,
        isConsistent
      },
      payload: {
        logs: mappedLogs,
        weightLogs: parsedWeightLogs,
        routines: [],
        exercises: customExercises
      }
    };

  } catch (error: any) {
    debugLogs.push(`[Error] Uncaught exception inside parseV1Excel: ${error.message || error}`);
    return {
      workoutLogsCount: 0,
      weightLogsCount: 0,
      routinesCount: 0,
      customExercisesCount: 0,
      hasError: true,
      errorMessage: `엑셀 파싱 및 검증 중 치명적 예외가 발생했습니다: ${error.message || error}`,
      verificationReport: createEmptyVerificationReport(),
      payload: null,
      debugLogs
    };
  }
}

function createEmptyVerificationReport() {
  return {
    squatV1: null,
    squatV2: 0,
    benchV1: null,
    benchV2: 0,
    deadV1: null,
    deadV2: 0,
    ohpV1: null,
    ohpV2: 0,
    totalV1: null,
    totalV2: 0,
    weightV1: null,
    weightV2: 0,
    isConsistent: false
  };
}
