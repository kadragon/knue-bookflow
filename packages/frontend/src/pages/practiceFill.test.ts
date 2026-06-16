import { describe, expect, it } from 'vitest';
import { fillPracticeContent } from './practiceFill';

describe('fillPracticeContent', () => {
  it('returns content as-is (no repeat)', () => {
    const content = '짧은 독서 노트 문장입니다.';
    expect(fillPracticeContent(content, 24)).toBe(content);
  });

  it('returns empty string for blank content', () => {
    expect(fillPracticeContent('   \n  ', 24)).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(fillPracticeContent('  hello  ', 24)).toBe('hello');
  });
});
