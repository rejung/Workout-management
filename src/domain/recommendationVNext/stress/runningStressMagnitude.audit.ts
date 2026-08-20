/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deriveRunningHistoricalReference } from '../context/runningHistoricalReference';
import { interpretRunningSessionVsHistory } from '../context/runningInterpretation';
import { deriveRunningStressMagnitude } from './runningStressMagnitude';
import { CanonicalRunningSession } from '../types/running.types';

function createMockRunningSession(
  params: {
    logId: string;
    date: string;
    startTime?: string;
    distanceKm?: number;
    durationSeconds?: number;
    distanceProvenance?: 'explicit' | 'legacy' | 'missing';
    durationProvenance?: 'explicit' | 'legacy' | 'missing';
    sourceConfidence?: 'high' | 'medium' | 'low';
  }
): CanonicalRunningSession {
  const distProv = params.distanceProvenance ?? (params.distanceKm !== undefined ? 'explicit' : 'missing');
  const durProv = params.durationProvenance ?? (params.durationSeconds !== undefined ? 'explicit' : 'missing');
  const conf = params.sourceConfidence ?? (
    params.distanceKm !== undefined && params.durationSeconds !== undefined
      ? 'high'
      : params.distanceKm !== undefined || params.durationSeconds !== undefined
      ? 'medium'
      : 'low'
  );

  const paceSecondsPerKm =
    params.distanceKm !== undefined && params.durationSeconds !== undefined && params.distanceKm > 0
      ? params.durationSeconds / params.distanceKm
      : undefined;

  return {
    logId: params.logId,
    date: params.date,
    startTime: params.startTime,
    exerciseName: '야외 러닝',
    metrics: {
      distanceKm: params.distanceKm,
      durationSeconds: params.durationSeconds,
      paceSecondsPerKm,
      sourceFormat: 'explicit-cardio-fields',
      provenance: {
        distance: distProv,
        duration: durProv,
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false,
      },
      sourceConfidence: conf,
      runIntent: 'unknown',
    },
  };
}

export interface RunningStressMagnitudeAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}

/**
 * Comprehensive verification suite for CU3.12G Running Stress Magnitude Implementation.
 */
export function runRunningStressMagnitudeAudits(): readonly RunningStressMagnitudeAuditResult[] {
  const results: RunningStressMagnitudeAuditResult[] = [];

  // Audit 1: Full Canonical Triad & Non-Additivity Invariant
  {
    const target = createMockRunningSession({
      logId: 'target-triad',
      date: '2026-08-15',
      startTime: '07:00',
      distanceKm: 10.0,
      durationSeconds: 3000, // pace = 300 s/km
      distanceProvenance: 'explicit',
      durationProvenance: 'explicit',
      sourceConfidence: 'high',
    });

    const h1 = createMockRunningSession({
      logId: 'h1',
      date: '2026-08-10',
      distanceKm: 8.0,
      durationSeconds: 2400, // pace = 300 s/km
    });

    const histRef = deriveRunningHistoricalReference(target, [h1]);
    const interp = interpretRunningSessionVsHistory(target, histRef);
    const mag = deriveRunningStressMagnitude(target, interp);

    const passed =
      mag.coupling.kind === 'full-canonical-triad' &&
      mag.coupling.isPaceDerived === true &&
      mag.coupling.isStructurallyCoupled === true &&
      mag.coupling.additiveCombinationAllowed === false &&
      mag.profiles.distance.unit === 'km' &&
      mag.profiles.distance.observedValue === 10.0 &&
      mag.profiles.distance.availability === 'available' &&
      mag.profiles.duration.unit === 'seconds' &&
      mag.profiles.duration.observedValue === 3000 &&
      mag.profiles.duration.availability === 'available' &&
      mag.profiles.pace.unit === 'seconds/km' &&
      mag.profiles.pace.observedValue === 300 &&
      mag.profiles.pace.availability === 'available';

    results.push({
      auditName: 'Full Canonical Triad & Non-Additivity Invariant',
      passed,
      details: passed
        ? 'Full triad accurately captures all three metrics, enforces literal units, and marks additiveCombinationAllowed as false.'
        : 'Failed full canonical triad invariants.',
    });
  }

  // Audit 2: Distance-Only Coupling & Zero-Coercion
  {
    const target = createMockRunningSession({
      logId: 'target-dist-only',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: undefined,
      distanceProvenance: 'explicit',
      sourceConfidence: 'medium',
    });

    const histRef = deriveRunningHistoricalReference(target, []);
    const interp = interpretRunningSessionVsHistory(target, histRef);
    const mag = deriveRunningStressMagnitude(target, interp);

    const passed =
      mag.coupling.kind === 'distance-only' &&
      mag.coupling.isPaceDerived === false &&
      mag.coupling.isStructurallyCoupled === false &&
      mag.coupling.additiveCombinationAllowed === false &&
      mag.profiles.distance.observedValue === 5.0 &&
      mag.profiles.distance.availability === 'available' &&
      mag.profiles.duration.observedValue === undefined &&
      mag.profiles.duration.availability === 'missing' &&
      mag.profiles.pace.observedValue === undefined &&
      mag.profiles.pace.availability === 'missing';

    results.push({
      auditName: 'Distance-Only Coupling & Zero-Coercion',
      passed,
      details: passed
        ? 'Distance-only profile preserves undefined for duration/pace without coercive conversion to 0.'
        : 'Failed distance-only invariants.',
    });
  }

  // Audit 3: Duration-Only Coupling & Zero-Coercion
  {
    const target = createMockRunningSession({
      logId: 'target-dur-only',
      date: '2026-08-15',
      distanceKm: undefined,
      durationSeconds: 1800,
      durationProvenance: 'legacy',
      sourceConfidence: 'medium',
    });

    const histRef = deriveRunningHistoricalReference(target, []);
    const interp = interpretRunningSessionVsHistory(target, histRef);
    const mag = deriveRunningStressMagnitude(target, interp);

    const passed =
      mag.coupling.kind === 'duration-only' &&
      mag.coupling.isPaceDerived === false &&
      mag.coupling.isStructurallyCoupled === false &&
      mag.coupling.additiveCombinationAllowed === false &&
      mag.profiles.distance.observedValue === undefined &&
      mag.profiles.distance.availability === 'missing' &&
      mag.profiles.duration.observedValue === 1800 &&
      mag.profiles.duration.availability === 'available' &&
      mag.profiles.duration.provenance === 'legacy' &&
      mag.profiles.pace.observedValue === undefined &&
      mag.profiles.pace.availability === 'missing';

    results.push({
      auditName: 'Duration-Only Coupling & Zero-Coercion',
      passed,
      details: passed
        ? 'Duration-only profile preserves undefined for distance/pace without coercive conversion to 0.'
        : 'Failed duration-only invariants.',
    });
  }

  // Audit 4: Missing All Metrics Coupling
  {
    const target = createMockRunningSession({
      logId: 'target-missing-all',
      date: '2026-08-15',
      distanceKm: undefined,
      durationSeconds: undefined,
      sourceConfidence: 'low',
    });

    const histRef = deriveRunningHistoricalReference(target, []);
    const interp = interpretRunningSessionVsHistory(target, histRef);
    const mag = deriveRunningStressMagnitude(target, interp);

    const passed =
      mag.coupling.kind === 'missing-all-metrics' &&
      mag.coupling.isPaceDerived === false &&
      mag.coupling.isStructurallyCoupled === false &&
      mag.coupling.additiveCombinationAllowed === false &&
      mag.profiles.distance.availability === 'missing' &&
      mag.profiles.duration.availability === 'missing' &&
      mag.profiles.pace.availability === 'missing';

    results.push({
      auditName: 'Missing All Metrics Coupling',
      passed,
      details: passed
        ? 'Missing-all session accurately captures missing-all-metrics coupling without crash or fake numbers.'
        : 'Failed missing-all coupling invariants.',
    });
  }

  // Audit 5: Pace Component Provenance Fidelity
  {
    const target = createMockRunningSession({
      logId: 'target-mixed-prov',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: 1500,
      distanceProvenance: 'explicit',
      durationProvenance: 'legacy',
      sourceConfidence: 'medium',
    });

    const histRef = deriveRunningHistoricalReference(target, []);
    const interp = interpretRunningSessionVsHistory(target, histRef);
    const mag = deriveRunningStressMagnitude(target, interp);

    const paceProv = mag.profiles.pace.provenance;
    const passed =
      paceProv !== undefined &&
      paceProv.distance === 'explicit' &&
      paceProv.duration === 'legacy' &&
      mag.profiles.distance.provenance === 'explicit' &&
      mag.profiles.duration.provenance === 'legacy' &&
      mag.profiles.pace.sourceConfidence === 'medium';

    results.push({
      auditName: 'Pace Component Provenance Fidelity in Magnitude Representation',
      passed,
      details: passed
        ? 'Pace magnitude profile retains exact component provenance without lossy single-value synthesis.'
        : 'Failed pace provenance fidelity in magnitude representation.',
    });
  }

  // Audit 6: Target Dimensions Exact Membership & Non-Attribution
  {
    const target = createMockRunningSession({
      logId: 'target-dims',
      date: '2026-08-15',
      distanceKm: 10.0,
      durationSeconds: 3000,
    });

    const histRef = deriveRunningHistoricalReference(target, []);
    const interp = interpretRunningSessionVsHistory(target, histRef);
    const mag = deriveRunningStressMagnitude(target, interp);

    const dims = mag.targetDimensions;
    const hasExactDims =
      dims.length === 2 &&
      dims[0] === 'knee-dominant-lower-body' &&
      dims[1] === 'hip-posterior-chain';

    // Verify there are no dimension-specific magnitude scores (e.g. mag.kneeDominantDistance)
    const hasNoDimensionAttribution =
      (mag as unknown as Record<string, unknown>).kneeDominantKm === undefined &&
      (mag as unknown as Record<string, unknown>).hipPosteriorKm === undefined;

    const passed = hasExactDims && hasNoDimensionAttribution;

    results.push({
      auditName: 'Target Dimensions Exact Membership (CU3.1 / CU3.11 Invariant)',
      passed,
      details: passed
        ? 'Target dimensions strictly contain knee-dominant-lower-body and hip-posterior-chain without magnitude splitting.'
        : 'Failed target dimensions exact membership invariants.',
    });
  }

  // Audit 7: Deep Immutability & Zero Input Mutation
  {
    const target = createMockRunningSession({
      logId: 'target-imm',
      date: '2026-08-15',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    const histRef = deriveRunningHistoricalReference(target, []);
    const interp = interpretRunningSessionVsHistory(target, histRef);

    const targetSnapshot = JSON.stringify(target);
    const interpSnapshot = JSON.stringify(interp);

    const mag = deriveRunningStressMagnitude(target, interp);

    const isFrozen =
      Object.isFrozen(mag) &&
      Object.isFrozen(mag.coupling) &&
      Object.isFrozen(mag.profiles) &&
      Object.isFrozen(mag.profiles.distance) &&
      Object.isFrozen(mag.profiles.duration) &&
      Object.isFrozen(mag.profiles.pace) &&
      Object.isFrozen(mag.targetDimensions);

    const noMutation =
      JSON.stringify(target) === targetSnapshot &&
      JSON.stringify(interp) === interpSnapshot;

    const passed = isFrozen && noMutation;

    results.push({
      auditName: 'Deep Immutability & Zero Input Mutation',
      passed,
      details: passed
        ? 'Stress magnitude object is deeply frozen and inputs remain strictly unmutated.'
        : 'Failed immutability and zero mutation invariants.',
    });
  }

  return results;
}
