/**
 * What a terminal remembers about itself between reloads (SPEC section 9).
 *
 * Only the four facts a computer needs to come back as the same country. No
 * student names, no decisions: those live on the instructor's computer, which
 * is the one place classroom data is allowed to be (SPEC section 9, privacy).
 *
 * The store is an interface rather than localStorage itself so a test can hand
 * the connection a plain object and a private-browsing window that refuses to
 * save cannot crash a lesson.
 */

const TERMINAL_KEY = 'crude-accord.terminal';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SavedTerminal {
  sessionId: string;
  teamId: string;
  token: string;
  /** "World 2 - Borvia (B)", so the landing page can greet the right team. */
  label: string;
}

/** A store that keeps nothing. Used when the browser refuses localStorage. */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export function browserStore(): KeyValueStore {
  try {
    const probe = '__crude-accord-probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private browsing, or storage turned off. The lesson still works; this
    // computer just has to type its join code again after a reload.
    return memoryStore();
  }
}

function isSaved(value: unknown): value is SavedTerminal {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['sessionId'] === 'string' &&
    typeof record['teamId'] === 'string' &&
    typeof record['token'] === 'string' &&
    typeof record['label'] === 'string'
  );
}

export function readTerminal(store: KeyValueStore): SavedTerminal | null {
  try {
    const raw = store.getItem(TERMINAL_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSaved(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTerminal(store: KeyValueStore, terminal: SavedTerminal): void {
  try {
    store.setItem(TERMINAL_KEY, JSON.stringify(terminal));
  } catch {
    // Nothing to do and nothing to say: the screen works either way.
  }
}

export function clearTerminal(store: KeyValueStore): void {
  try {
    store.removeItem(TERMINAL_KEY);
  } catch {
    // As above.
  }
}

// ---------------------------------------------------------------------------
// The instructor's own computer.
// ---------------------------------------------------------------------------

/**
 * What the instructor computer remembers so /instructor resumes the saved game
 * instead of starting a new one (SPEC 8.4).
 *
 * The instructor key is in here because it is in the instructor's own link
 * already, and this is the one computer it is allowed to be on. The projector
 * key is deliberately not: it arrives in the instructor's view, so there is one
 * place it comes from and nothing has to keep two copies in step.
 */
const INSTRUCTOR_KEY = 'crude-accord.instructor';

export interface SavedInstructor {
  sessionId: string;
  instructorKey: string;
}

function isSavedInstructor(value: unknown): value is SavedInstructor {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['sessionId'] === 'string' && typeof record['instructorKey'] === 'string';
}

export function readInstructor(store: KeyValueStore): SavedInstructor | null {
  try {
    const raw = store.getItem(INSTRUCTOR_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSavedInstructor(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeInstructor(store: KeyValueStore, saved: SavedInstructor): void {
  try {
    store.setItem(INSTRUCTOR_KEY, JSON.stringify(saved));
  } catch {
    // The dashboard still works; this computer just has to use the link again.
  }
}

export function clearInstructor(store: KeyValueStore): void {
  try {
    store.removeItem(INSTRUCTOR_KEY);
  } catch {
    // As above.
  }
}

// ---------------------------------------------------------------------------
// The number a group has typed but not yet sent.
// ---------------------------------------------------------------------------

/**
 * A draft decision, kept per session and year so a reload does not lose it.
 *
 * A group types 38.3, the laptop sleeps or someone closes the tab, and the
 * number they had agreed on is gone with a timer running. That is worth one
 * line in localStorage. It is only ever the number they typed: the decision
 * that counts is the one the server holds, and this is cleared the moment the
 * server confirms it.
 */
const DRAFT_PREFIX = 'crude-accord.draft';

function draftKey(sessionId: string, year: number): string {
  return `${DRAFT_PREFIX}.${sessionId}.${String(year)}`;
}

export function readDraft(store: KeyValueStore, sessionId: string, year: number): string | null {
  try {
    return store.getItem(draftKey(sessionId, year));
  } catch {
    return null;
  }
}

export function writeDraft(
  store: KeyValueStore,
  sessionId: string,
  year: number,
  text: string,
): void {
  try {
    store.setItem(draftKey(sessionId, year), text);
  } catch {
    // Nothing to do and nothing to say: the screen works either way.
  }
}

export function clearDraft(store: KeyValueStore, sessionId: string, year: number): void {
  try {
    store.removeItem(draftKey(sessionId, year));
  } catch {
    // As above.
  }
}
