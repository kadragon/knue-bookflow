import { describe, expect, it } from 'vitest';
import { fillPracticeContent } from './practiceFill';

describe('fillPracticeContent', () => {
  it('preserves content with no surrounding whitespace', () => {
    const content = '짧은 독서 노트 문장입니다.';
    expect(fillPracticeContent(content)).toBe(content);
  });

  it('returns empty string for blank content', () => {
    expect(fillPracticeContent('   \n  ')).toBe('');
  });

  it('trims surrounding whitespace', () => {
    expect(fillPracticeContent('  hello  ')).toBe('hello');
  });

  it('preserves internal whitespace and newlines', () => {
    expect(fillPracticeContent('first line\nsecond line')).toBe(
      'first line\nsecond line',
    );
  });
});
