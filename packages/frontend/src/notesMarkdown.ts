/**
 * Client-side Markdown export of a single book's reading notes (Obsidian-friendly).
 */

import type { BookItem, NoteItem } from './api';

type BookMeta = Pick<BookItem, 'title' | 'author' | 'isbn13'>;

const FALLBACK_FILENAME = 'book-notes';

function yamlString(value: string): string {
  // JSON double-quoted strings are valid YAML double-quoted scalars.
  return JSON.stringify(value);
}

function toBlockquote(content: string): string {
  return content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.length > 0 ? `> ${line}` : '>'))
    .join('\n');
}

export function formatBookNotesMarkdown(
  book: BookMeta,
  notes: readonly NoteItem[],
): string {
  const lines: string[] = [
    '---',
    `title: ${yamlString(book.title)}`,
    `author: ${yamlString(book.author)}`,
  ];
  if (book.isbn13) lines.push(`isbn: ${yamlString(book.isbn13)}`);
  lines.push('---', '', `# ${book.title}`, '', `- 저자: ${book.author}`);
  if (book.isbn13) lines.push(`- ISBN: ${book.isbn13}`);
  lines.push('');

  const sorted = [...notes].sort(
    (a, b) => a.pageNumber - b.pageNumber || a.id - b.id,
  );
  let currentPage: number | null = null;
  for (const note of sorted) {
    if (note.pageNumber !== currentPage) {
      currentPage = note.pageNumber;
      lines.push(`## p. ${currentPage}`, '');
    }
    lines.push(toBlockquote(note.content), '');
  }

  return lines.join('\n');
}

export function toMarkdownFilename(title: string): string {
  const base = title
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars from filenames
    .replace(/[/\\:*?"<>|\u0000-\u001f\u007f]/g, (ch) =>
      /\s/.test(ch) ? ' ' : '',
    )
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  return `${base || FALLBACK_FILENAME}.md`;
}

export function downloadMarkdown(filename: string, markdown: string): void {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
