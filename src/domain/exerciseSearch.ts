/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Exercise Search Domain
 * Centralized Single Source of Truth (SSOT) for exercise search, category mappings, and synonym matching.
 */

export const KOREAN_CATEGORY_MAP: Record<string, string> = {
  'Chest': '가슴',
  'Back': '등',
  'Legs': '하체',
  'Shoulders': '어깨',
  'Arms': '팔',
  'Core': '복근',
  'Cardio': '유산소'
};

export const CATEGORY_MAP: Record<string, string[]> = {
  'ALL': ['ALL'],
  '가슴': ['Chest', '가슴'],
  '등': ['Back', '등'],
  '하체': ['Legs', '하체'],
  '어깨': ['Shoulders', '어깨'],
  '팔': ['Arms', '팔'],
  '복근': ['Core', '복근'],
  '유산소': ['Cardio', '유산소']
};

// Synonym dictionary for cross-language search (Korean <-> English)
export const SYNONYM_MAP: Record<string, string[]> = {
  '벤치': ['bench'],
  'bench': ['벤치'],
  '스쿼트': ['squat'],
  'squat': ['스쿼트'],
  '데드리프트': ['deadlift', 'dead'],
  '데드': ['deadlift', 'dead', '데드리프트'],
  'deadlift': ['데드리프트', '데드'],
  'dead': ['데드리프트', '데드'],
  '오버헤드': ['overhead', 'ohp'],
  'overhead': ['오버헤드', 'ohp'],
  'ohp': ['오버헤드', '밀리터리', '밀프'],
  '밀리터리': ['military', 'ohp'],
  'military': ['밀리터리', 'ohp'],
  '풀업': ['pullup', 'pull-up', 'pull up'],
  'pullup': ['풀업', '턱걸이'],
  'pull-up': ['풀업', '턱걸이'],
  '덤벨': ['dumbbell'],
  'dumbbell': ['덤벨'],
  '바벨': ['barbell'],
  'barbell': ['바벨'],
  '케이블': ['cable'],
  'cable': ['케이블'],
  '머신': ['machine'],
  'machine': ['머신'],
  '익스텐션': ['extension'],
  'extension': ['익스텐션'],
  '레이즈': ['raise'],
  'raise': ['레이즈'],
  '컬': ['curl'],
  'curl': ['컬'],
  '로우': ['row'],
  'row': ['로우'],
  '플라이': ['fly'],
  'fly': ['플라이'],
  '딥스': ['dips'],
  'dips': ['딥스'],
  '플랭크': ['plank'],
  'plank': ['플랭크'],
  '크런치': ['crunch'],
  'crunch': ['크런치'],
  '트레드밀': ['treadmill', 'running', '러닝'],
  'treadmill': ['트레드밀', '러닝'],
  '자전거': ['bike', 'cycle', '사이클'],
  'bike': ['자전거', '사이클']
};

export const EXERCISE_CATEGORIES = ['ALL', '가슴', '등', '하체', '어깨', '팔', '복근', '유산소'];

export interface SearchableExercise {
  id: string;
  name: string;
  category: string;
  canonicalName?: string;
  notes?: string;
}

/**
 * Filter exercises by category and multi-lingual synonym keyword search.
 */
export function filterExercises<T extends SearchableExercise>(
  exercises: T[],
  selectedCategory: string = 'ALL',
  searchKeyword: string = ''
): T[] {
  return exercises.filter(ex => {
    // 1. Category Filter: Match Korean/English category
    if (selectedCategory !== 'ALL') {
      const allowed = CATEGORY_MAP[selectedCategory] || [selectedCategory];
      const matchesCategory = allowed.some(c => c.toLowerCase() === (ex.category || '').toLowerCase());
      if (!matchesCategory) return false;
    }

    // 2. Search Filter
    const query = searchKeyword.trim().toLowerCase();
    if (!query) return true;

    const koreanCat = KOREAN_CATEGORY_MAP[ex.category] || ex.category;
    const searchableText = [
      ex.name,
      ex.canonicalName,
      ex.id,
      ex.notes,
      ex.category,
      koreanCat
    ].filter(Boolean).join(' ').toLowerCase();

    // Direct substring check
    if (searchableText.includes(query)) return true;

    // Full query synonym check
    const synonyms = SYNONYM_MAP[query] || [];
    for (const syn of synonyms) {
      if (searchableText.includes(syn.toLowerCase())) {
        return true;
      }
    }

    // Word-by-word synonym check for multi-word search queries
    const queryWords = query.split(/\s+/).filter(Boolean);
    if (queryWords.length > 0) {
      const allWordsMatch = queryWords.every(word => {
        if (searchableText.includes(word)) return true;
        const wordSyns = SYNONYM_MAP[word] || [];
        return wordSyns.some(syn => searchableText.includes(syn.toLowerCase()));
      });
      if (allWordsMatch) return true;
    }

    return false;
  });
}
