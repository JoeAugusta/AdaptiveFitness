import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendJordanWeightLine, sanitizeJordanOutput } from './jordanOutput';

describe('sanitizeJordanOutput', () => {
  it('rejects meta-leak sample', () => {
    assert.equal(
      sanitizeJordanOutput('Wait, let me re-read the rules...', 1),
      null,
    );
  });

  it('passes a clean single sentence', () => {
    assert.equal(
      sanitizeJordanOutput('Drive through the sticking point.', 1),
      'Drive through the sticking point.',
    );
  });

  it('trims three sentences to the max limit', () => {
    const input =
      'First sentence. Second sentence. Third sentence.';
    assert.equal(sanitizeJordanOutput(input, 1), 'First sentence.');
    assert.equal(
      sanitizeJordanOutput(input, 2),
      'First sentence. Second sentence.',
    );
  });

  it('rejects mid-sentence truncation with no complete sentence', () => {
    assert.equal(sanitizeJordanOutput('Push through the nex', 1), null);
  });
});

describe('appendJordanWeightLine', () => {
  it('appends weight using the same numeric value as suggestedWeight', () => {
    const suggestedWeight = 185;
    const feedback = 'Stay tight on the descent.';
    assert.equal(
      appendJordanWeightLine(feedback, suggestedWeight),
      'Stay tight on the descent. Try 185 lbs next set.',
    );
  });
});
