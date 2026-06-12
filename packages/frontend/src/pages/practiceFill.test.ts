import { describe, expect, it } from 'vitest';
import { fillPracticeContent, sheetCharCapacity } from './practiceFill';

describe('sheetCharCapacity', () => {
  it('returns a positive capacity that shrinks as font size grows', () => {
    const small = sheetCharCapacity(18);
    const large = sheetCharCapacity(40);
    expect(small).toBeGreaterThan(0);
    expect(large).toBeGreaterThan(0);
    expect(small).toBeGreaterThan(large);
  });
});

describe('fillPracticeContent', () => {
  it('repeats short content until it overfills one page', () => {
    const content = '짧은 독서 노트 문장입니다.';
    const filled = fillPracticeContent(content, 24);
    const capacity = sheetCharCapacity(24);
    expect(filled.startsWith(content)).toBe(true);
    expect(filled).toContain(`${content}\n\n${content}`);
    expect(Array.from(filled).length).toBeGreaterThanOrEqual(capacity);
  });

  it('keeps long content as a single copy', () => {
    const capacity = sheetCharCapacity(24);
    const content = '가'.repeat(capacity + 10);
    expect(fillPracticeContent(content, 24)).toBe(content);
  });

  it('returns empty string for blank content', () => {
    expect(fillPracticeContent('   \n  ', 24)).toBe('');
  });

  it('caps repeats so tiny content does not explode', () => {
    const filled = fillPracticeContent('가', 18);
    expect(Array.from(filled).length).toBeLessThan(sheetCharCapacity(18) * 3);
  });
});
