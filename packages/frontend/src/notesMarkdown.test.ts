import { describe, expect, it } from 'vitest';
import type { BookItem, NoteItem } from './api';
import { formatBookNotesMarkdown, toMarkdownFilename } from './notesMarkdown';

const book = {
  title: '채식주의자',
  author: '한강',
  isbn13: '9788936433598',
} as Pick<BookItem, 'title' | 'author' | 'isbn13'>;

function note(id: number, pageNumber: number, content: string): NoteItem {
  return {
    id,
    bookId: 1,
    pageNumber,
    content,
    createdAt: '2026-01-01 00:00:00',
    updatedAt: '2026-01-01 00:00:00',
  };
}

describe('formatBookNotesMarkdown', () => {
  it('renders metadata, then notes grouped by page asc and note id asc', () => {
    const notes = [
      note(7, 42, '두 번째 메모'),
      note(3, 10, '첫 페이지 메모'),
      note(2, 42, '같은 페이지\n여러 줄 메모'),
    ];

    expect(formatBookNotesMarkdown(book, notes)).toBe(
      [
        '---',
        'title: "채식주의자"',
        'author: "한강"',
        'isbn: "9788936433598"',
        '---',
        '',
        '# 채식주의자',
        '',
        '- 저자: 한강',
        '- ISBN: 9788936433598',
        '',
        '## p. 10',
        '',
        '> 첫 페이지 메모',
        '',
        '## p. 42',
        '',
        '> 같은 페이지',
        '> 여러 줄 메모',
        '',
        '> 두 번째 메모',
        '',
      ].join('\n'),
    );
  });

  it('keeps blank lines inside a note within the same blockquote', () => {
    const md = formatBookNotesMarkdown(book, [note(1, 5, '문단 1\n\n문단 2')]);
    expect(md).toContain('> 문단 1\n>\n> 문단 2\n');
  });

  it('normalizes CRLF line endings in note content', () => {
    const md = formatBookNotesMarkdown(book, [note(1, 5, '줄 1\r\n줄 2')]);
    expect(md).toContain('> 줄 1\n> 줄 2\n');
  });

  it('omits ISBN when missing', () => {
    const md = formatBookNotesMarkdown({ ...book, isbn13: null }, []);
    expect(md).not.toContain('ISBN');
    expect(md).not.toContain('isbn');
    expect(md).not.toContain('null');
  });

  it('escapes quotes in frontmatter values', () => {
    const md = formatBookNotesMarkdown(
      { ...book, title: '그가 "안녕"이라 말했다' },
      [],
    );
    expect(md).toContain('title: "그가 \\"안녕\\"이라 말했다"');
  });

  it('does not mutate the input notes array', () => {
    const notes = [note(2, 9, 'b'), note(1, 1, 'a')];
    const snapshot = notes.map((n) => n.id);
    formatBookNotesMarkdown(book, notes);
    expect(notes.map((n) => n.id)).toEqual(snapshot);
  });
});

describe('toMarkdownFilename', () => {
  it('appends .md to the title', () => {
    expect(toMarkdownFilename('채식주의자')).toBe('채식주의자.md');
  });

  it('strips path separators and filename-illegal characters', () => {
    expect(toMarkdownFilename('../a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij.md');
  });

  it('collapses whitespace and trims', () => {
    expect(toMarkdownFilename('  책   제목\n2권 ')).toBe('책 제목 2권.md');
  });

  it('falls back when nothing usable remains', () => {
    expect(toMarkdownFilename('///')).toBe('book-notes.md');
    expect(toMarkdownFilename('..')).toBe('book-notes.md');
  });
});
