/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Exercise the actual production JSX and submit closure, rather than copying
// their implementation into the test. Browser constraint validation is separate.
const source = readFileSync(new URL('./WorkoutForm.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('WorkoutForm.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let weightInput: ts.JsxSelfClosingElement | undefined;
let submit: ts.Expression | undefined;
function visit(node: ts.Node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'input') {
    const change = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(ast) === 'onChange');
    if (change?.getText(ast).includes("'weight'")) {
      assert.equal(weightInput, undefined, 'There must be exactly one standard weight input');
      weightInput = node;
    }
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleSubmit') submit = node.initializer;
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(weightInput, 'Production standard weight input found');
assert.ok(submit, 'Production submit handler found');

function evaluate(code: string, context: Record<string, unknown>) {
  const compiled = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.None },
  }).outputText;
  runInNewContext(compiled, context);
  return context;
}

test('production weight input accepts direct values independently of increment policy', () => {
  for (const value of [6, 0, 7, 11, 13.5, 6.25]) {
    const updates: unknown[][] = [];
    const context = evaluate(`globalThis.input = (${weightInput!.getText(ast)});`, {
      React, set: { id: 'set-1', weight: value }, ae: { exerciseId: 'lateral-raise' },
      // Old JSX selects 2.5 here, reproducing the screenshot's metadata fallback.
      isCable: false, weightStep: 2.5,
      handleUpdateSet: (...args: unknown[]) => updates.push(args),
    });
    const input = context.input as React.ReactElement<any>;
    assert.equal(input.props.step, 'any', `${value}kg must not be constrained to a step multiple`);
    assert.equal(input.props.min, '0');
    assert.equal(input.props.type, 'number');
    assert.equal(input.props.value, value);
    assert.match(renderToStaticMarkup(input), /step="any"/);
    input.props.onChange({ target: { value: String(value) } });
    assert.deepEqual(updates, [['lateral-raise', 'set-1', 'weight', String(value)]]);
  }
});

function submitWeight(weight: unknown) {
  const saves: any[] = [];
  const alerts: string[] = [];
  const set = { id: 'set-1', weight, reps: 20, isWarmup: false };
  const context = evaluate(`globalThis.submit = (${submit!.getText(ast)});`, {
    activeExercises: [{ exerciseId: 'lateral-raise', exerciseName: '사이드 레터럴 레이즈', category: 'Shoulders', sets: [set] }],
    exercises: [{ id: 'lateral-raise', name: '사이드 레터럴 레이즈', logType: 'STANDARD' }],
    editingLog: null, date: '2026-10-31', startTime: '12:00', selectedRoutineId: '', notes: '',
    generateUUID: () => 'saved-log', onSave: (log: unknown) => saves.push(log),
    showAlert: (message: string) => alerts.push(message),
  });
  (context.submit as (event: { preventDefault(): void }) => void)({ preventDefault() {} });
  return { saves, alerts, set };
}

test('production submit preserves direct weights and repetitions without rounding', () => {
  for (const weight of ['0', '6', '7', '11', '13.5', '6.25']) {
    const { saves, alerts, set } = submitWeight(weight);
    assert.equal(alerts.length, 0);
    assert.equal(saves.length, 1);
    const saved = saves[0].exercises[0].sets[0];
    assert.equal(saved.weight, Number(weight));
    assert.equal(saved.reps, 20);
    assert.equal(saved.id, 'set-1');
    assert.equal(set.weight, weight, 'Submitting must not mutate the input set');
  }
});

test('production submit still blocks blank, negative, NaN and infinite weights', () => {
  for (const weight of ['', null, undefined, -1, '-1', NaN, Infinity, -Infinity, 'NaN', 'Infinity']) {
    const { saves, alerts } = submitWeight(weight);
    assert.equal(saves.length, 0, `${String(weight)} must not be saved`);
    assert.equal(alerts.length, 1);
  }
});
