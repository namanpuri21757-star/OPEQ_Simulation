/**
 * The classroom materials, described as data rather than written twice.
 *
 * Each one is a list of blocks built from the session's settings. The generator
 * (`npm run benchmarks`) turns the blocks into the Markdown files in
 * docs/materials, and /instructor/materials renders the same blocks as a
 * printable page. One source means the handout and the screen can never
 * disagree, and `npm run verify` fails if the files on disk fall behind.
 */

export type MaterialBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'subheading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'steps'; items: string[] }
  | { kind: 'note'; text: string }
  /** A line of arithmetic, shown in a fixed-width box. */
  | { kind: 'formula'; text: string }
  | { kind: 'table'; caption: string; columns: string[]; rows: string[][] };

export interface MaterialDoc {
  /** Used in the file name and the URL: "student-briefing". */
  slug: string;
  title: string;
  /** One line under the title, saying who it is for. */
  intro: string;
  blocks: MaterialBlock[];
}

export function fileNameOf(doc: MaterialDoc): string {
  return `${doc.slug}.md`;
}
