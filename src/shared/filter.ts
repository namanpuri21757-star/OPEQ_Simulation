/**
 * A mild, school-appropriate word filter (SPEC section 6).
 *
 * Why masking and not rejecting: a rejected message makes a student try again
 * with a workaround and takes attention off the game. Masking lets the message
 * through, keeps the room calm, and the instructor still sees who wrote what.
 *
 * The list is deliberately short and mild. It is not a content moderation
 * system; it is a speed bump for a classroom, and the instructor's mute button
 * is the real tool. It applies to chat messages and to member names, because a
 * name shows on the dashboard and on the projector's table cards.
 */

/**
 * Lower case, no spaces. Kept small on purpose: a long list catches innocent
 * words (the "Scunthorpe problem") and that is worse in class than missing one.
 */
const BLOCKED = [
  'arse',
  'arsehole',
  'ass',
  'asshole',
  'bastard',
  'bitch',
  'bollocks',
  'bugger',
  'crap',
  'damn',
  'dick',
  'dickhead',
  'dumbass',
  'fuck',
  'fucker',
  'fucking',
  'idiot',
  'moron',
  'piss',
  'prick',
  'shit',
  'shitty',
  'slut',
  'stupid',
  'twat',
  'wanker',
  'whore',
] as const;

/**
 * Characters people swap in to slip a word past a filter. Only the obvious
 * ones, so "l33t" tricks are caught but ordinary words are not mangled.
 */
const LOOKALIKES: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
};

const BLOCKED_SET = new Set<string>(BLOCKED);

/** The longest blocked word, so the scanner knows how far ahead to look. */
const LONGEST = BLOCKED.reduce((max, word) => Math.max(max, word.length), 0);

/** Turns one character into the letter it is pretending to be, or ''. */
function normalizeChar(ch: string): string {
  const lower = ch.toLowerCase();
  const swap = LOOKALIKES[lower];
  if (swap) return swap;
  return /[a-z]/.test(lower) ? lower : '';
}

/**
 * A letters-only copy of the text, plus, for each letter, where it came from
 * and whether it stood at the start or end of a word in the original.
 *
 * Why the boundaries are worked out here and not from the letters string: once
 * the punctuation is gone every letter touches the next one, so "class" would
 * look like it starts a word at its "ass". They have to be read off the text
 * the student actually typed.
 */
interface Scan {
  letters: string;
  at: number[];
  startsWord: boolean[];
  endsWord: boolean[];
}

function scan(text: string): Scan {
  const normalized = [...text].map((ch) => normalizeChar(ch));
  const out: Scan = { letters: '', at: [], startsWord: [], endsWord: [] };

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (ch === undefined || ch === '') continue;
    out.letters += ch;
    out.at.push(i);
    out.startsWord.push(i === 0 || (normalized[i - 1] ?? '') === '');
    out.endsWord.push(i === normalized.length - 1 || (normalized[i + 1] ?? '') === '');
  }
  return out;
}

export interface FilterResult {
  text: string;
  /** True when anything was masked, so a caller can log or warn. */
  changed: boolean;
}

/**
 * Replaces blocked words with asterisks, keeping the rest of the text as typed.
 *
 * A match has to start and end on a word boundary, so "class" keeps its "ass"
 * and "Scunthorpe" survives. Punctuation inside a word is ignored, so "s.h.i.t"
 * is caught too; the price of that is that a word split across a space, like
 * "a ss", is also caught, which is the right way round for a classroom.
 */
export function filterText(input: string): FilterResult {
  const text = input ?? '';
  const { letters, at, startsWord, endsWord } = scan(text);
  if (letters === '') return { text, changed: false };

  // Positions in the original string that have to become an asterisk.
  const masked = new Set<number>();

  for (let i = 0; i < letters.length; i += 1) {
    if (!startsWord[i]) continue;
    // Longest match first, so "fucking" masks fully instead of leaving "ing".
    for (let len = Math.min(LONGEST, letters.length - i); len >= 2; len -= 1) {
      if (!endsWord[i + len - 1]) continue;
      if (!BLOCKED_SET.has(letters.slice(i, i + len))) continue;

      for (let k = i; k < i + len; k += 1) {
        const pos = at[k];
        if (pos !== undefined) masked.add(pos);
      }
      i += len - 1;
      break;
    }
  }

  if (masked.size === 0) return { text, changed: false };

  const out = [...text];
  for (const pos of masked) out[pos] = '*';
  return { text: out.join(''), changed: true };
}

/** Convenience for places that only want the cleaned text. */
export function clean(input: string): string {
  return filterText(input).text;
}

/**
 * A member name: trimmed, collapsed whitespace, filtered, and never nameless.
 *
 * A name that has no letter or digit left once the filter has run - someone
 * typed only punctuation, or a word that was masked end to end - becomes the
 * numbered default from SPEC section 5. A row of asterisks on the projector
 * would be worse for the group than "Member 2".
 */
export function cleanMemberName(input: string, index: number): string {
  const collapsed = (input ?? '').trim().replace(/\s+/g, ' ');
  const filtered = clean(collapsed);
  const readable = /[\p{L}\p{N}]/u.test(filtered);
  return readable ? filtered : `Member ${String(index + 1)}`;
}
