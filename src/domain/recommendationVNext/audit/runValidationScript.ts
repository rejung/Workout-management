import { runCU51Validation } from './realReplayValidation.cu51';
import { HistoricalReplayResult } from '../types/historicalReplay.types';
import { runProductionCutoverSanitySuite } from '../production/productionCutoverSanity.test';
import { runProjectedSessionAudit } from './projectedSessionAudit';
import { runPresentationWiringAudit } from './presentationWiringAudit';

function formatCompactPoint(pointResult: HistoricalReplayResult) {
  return {
    evaluationInstant: pointResult.evaluationPoint.evaluationInstant,
    decision: pointResult.todayDecision.kind,
    primaryCandidate: pointResult.todayDecision.primaryCandidate?.candidateExerciseName ?? null,
    primaryCandidateId: pointResult.todayDecision.primaryCandidate?.candidateExerciseId ?? null,
    restSupportClass: pointResult.restDecisionEvidence.restSupportClass,
    eligibleSessions: pointResult.availableHistoricalEvidenceCount.totalEligibleSessionCount,
    excludedFutureSessions: pointResult.availableHistoricalEvidenceCount.excludedFutureSessionCount,
    topCandidates: pointResult.candidateDecisionSet.candidates.map((c) => ({
      id: c.candidateExerciseId,
      readiness: c.readinessEvidence.overallReadinessClass,
      need: c.trainingNeedEvidence.needClass,
      opportunity: c.progressOpportunityEvidence.opportunityClass,
      decisionClass: c.decisionClass,
    })),
  };
}

console.log('==================================================');
console.log('1. RUNNING PRODUCTION CUTOVER SANITY SUITE (CU6.0)');
console.log('==================================================');
const cutoverRes = runProductionCutoverSanitySuite();
console.log(`All Production Cutover Sanity Cases Passed: ${cutoverRes.allPassed}`);
cutoverRes.results.forEach((r, idx) => {
  console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}: ${r.details}`);
});

console.log('\n==================================================');
console.log('2. RUNNING CU5.1 HISTORICAL VALIDATION REGRESSION');
console.log('==================================================');
const res = runCU51Validation();

console.log('=== REAL-01 (Compact) ===');
console.log(JSON.stringify(formatCompactPoint(res.real01), null, 2));

console.log('\n=== REAL-02 (Compact) ===');
console.log(JSON.stringify(formatCompactPoint(res.real02), null, 2));

console.log('\n=== REAL-03 (Full Decision Trace) ===');
console.log(JSON.stringify(res.real03FullTrace, null, 2));

console.log('\n=== REAL-04 (Compact) ===');
console.log(JSON.stringify(formatCompactPoint(res.real04), null, 2));

console.log('\n=== MODERN REPLAY AGGREGATE STATISTICS (2026-08-07 ~ 2026-08-17) ===');
console.log(JSON.stringify(res.modernReport.statistics, null, 2));

console.log('\n=== ANOMALIES ===');
if (!res.modernReport.anomalies || res.modernReport.anomalies.length === 0) {
  console.log('ANOMALIES: none');
} else {
  console.log(
    JSON.stringify(
      res.modernReport.anomalies.map((a) => ({
        evaluationInstant: a.evaluationInstant,
        category: a.category,
        vNextDecision: a.vNextDecision,
        suspectedCause: a.suspectedCause,
      })),
      null,
      2
    )
  );
}

console.log('\n=== GOLDEN SCENARIOS (GS1~GS10) REGRESSION ===');
console.log(`Golden Scenarios All Passed: ${res.goldenScenariosPassed}`);
if (!res.goldenScenariosPassed) {
  console.log('Failures:', res.gsFailedDetails);
}

console.log('\n==================================================');
console.log('3. RUNNING NEXT PROJECTED SESSION AUDIT (PS1~PS9 + PT1~PT6)');
console.log('==================================================');
const psAudit = runProjectedSessionAudit();
console.log(`All Projected Session Audit Cases Passed: ${psAudit.allPassed} (${psAudit.passedCount}/${psAudit.totalCount})`);
psAudit.results.forEach((r) => {
  console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.scenarioId}: ${r.title} -> ${r.details}`);
});

console.log('\n==================================================');
console.log('4. RUNNING PRESENTATION WIRING AUDIT (PW1~PW3)');
console.log('==================================================');
const pwAudit = runPresentationWiringAudit();
console.log(`All Presentation Wiring Audit Cases Passed: ${pwAudit.allPassed} (${pwAudit.passedCount}/${pwAudit.totalCount})`);
pwAudit.results.forEach((r) => {
  console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.scenarioId}: ${r.title} -> ${r.details}`);
});



