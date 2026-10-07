/**
 * npm run benchmarks
 *
 * Prints the teacher answer key for one preset and writes the three generated
 * teacher materials. With --check it writes nothing and fails if a file on disk
 * no longer matches the engine, which is how npm run verify catches a change to
 * the economics that nobody wrote down.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PRESET_NAMES, PRESETS, type PresetName } from '../src/shared/settings.js';
import { markdownFor, materialsFor } from '../src/shared/materials/index.js';
import { answerKeyDocument, answerKeyFor } from './materials/answer-key.js';
import { economicsDocument } from './materials/economics.js';
import { engineCheckCsv } from './materials/engine-check.js';

const root = fileURLToPath(new URL('..', import.meta.url));

const files: Array<{ path: string; build: () => string }> = [
  { path: 'docs/materials/answer-key.md', build: answerKeyDocument },
  { path: 'docs/ECONOMICS.md', build: economicsDocument },
  { path: 'docs/materials/engine-check.csv', build: engineCheckCsv },
  // The classroom materials, built from the standard settings. The screen at
  // /instructor/materials renders the same documents from the live settings.
  ...materialsFor(PRESETS['standard-75']).map((doc) => ({
    path: `docs/materials/${doc.slug}.md`,
    build: () => markdownFor(doc),
  })),
];

function presetFromArgs(args: string[]): PresetName {
  const given = args.find((a) => a.startsWith('--preset='))?.slice('--preset='.length);
  if (given === undefined) return 'standard-75';
  if ((PRESET_NAMES as readonly string[]).includes(given)) return given as PresetName;
  throw new Error(`Unknown preset "${given}". Choose one of: ${PRESET_NAMES.join(', ')}.`);
}

/** Line endings differ between machines; the content is what has to match. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

async function check(): Promise<void> {
  const stale: string[] = [];
  for (const file of files) {
    const onDisk = await readFile(`${root}${file.path}`, 'utf8').catch(() => null);
    if (onDisk === null || normalize(onDisk) !== file.build()) stale.push(file.path);
  }
  if (stale.length > 0) {
    throw new Error(
      `These generated files no longer match the engine:\n  ${stale.join('\n  ')}\nRun: npm run benchmarks`,
    );
  }
  console.log(`Generated materials are up to date (${files.length} files).`);
}

async function write(preset: PresetName): Promise<void> {
  console.log(answerKeyFor(preset).join('\n'));
  for (const file of files) {
    await writeFile(`${root}${file.path}`, file.build(), 'utf8');
    console.log(`\nWrote ${file.path}`);
  }
}

const args = process.argv.slice(2);
try {
  if (args.includes('--check')) await check();
  else await write(presetFromArgs(args));
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
