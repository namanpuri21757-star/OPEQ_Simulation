/**
 * Reading a session that was saved by v1.
 *
 * v2 removed announcements, structured pledges, huddles, the waiting questions,
 * the news feed, the demand event and the chat mode. A folder under data/ may
 * still hold all of them, and a teacher who opens the app after an update should
 * get their lesson back rather than an error, so everything that is gone is
 * dropped here on the way in and nothing else is touched.
 *
 * This is the only place that knows the old shapes. It takes `unknown` and
 * hands back a SessionState, so no v1 field can reach the rest of the server by
 * being structurally compatible with a v2 type.
 */

import { validateSettings } from '../../shared/settings.js';
import type { MessageRecord, MessagingWindow, SessionState } from '../../shared/state.js';

/** The v1 settings keys v2 has no field for. */
const REMOVED_SETTINGS = ['chatMode', 'demandEvent'] as const;

/** The v1 team keys v2 has no field for. */
const REMOVED_TEAM_FIELDS = ['huddles', 'predictions'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Keeps only the messages a world channel can still hold.
 *
 * A v1 announcement has no world and no country, and a v1 pledge is a chat line
 * with a number stapled to it. The announcement is dropped (nothing shows it
 * any more); the pledge keeps its sentence, which is what the group actually
 * said to the others.
 */
function messagesFrom(raw: unknown): MessageRecord[] {
  if (!Array.isArray(raw)) return [];
  const out: MessageRecord[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const { messageId, worldId, teamId, letter, text, at } = item;
    if (typeof messageId !== 'string' || typeof text !== 'string') continue;
    if (typeof worldId !== 'string' || typeof teamId !== 'string') continue;
    if (letter !== 'A' && letter !== 'B' && letter !== 'C') continue;
    if (typeof at !== 'number') continue;
    out.push({ messageId, worldId, teamId, letter, text, at });
  }
  return out;
}

function messagingFrom(raw: unknown): Record<string, MessagingWindow> {
  if (!isRecord(raw)) return {};
  const out: Record<string, MessagingWindow> = {};
  for (const [worldId, window] of Object.entries(raw)) {
    if (!isRecord(window)) continue;
    const until = window['until'];
    const startedAt = window['startedAt'];
    if (typeof startedAt !== 'number') continue;
    out[worldId] = { until: typeof until === 'number' ? until : null, startedAt };
  }
  return out;
}

/**
 * A saved state with every removed field taken off, or null when the file is
 * not a session this version can use at all.
 */
export function upgradeSnapshot(parsed: unknown): SessionState | null {
  if (!isRecord(parsed)) return null;
  if (parsed['schema'] !== 1 || typeof parsed['sessionId'] !== 'string') return null;

  const state = { ...parsed } as Record<string, unknown>;

  // Settings: drop what is gone, then re-validate so the defaults v2 added are
  // filled in. A settings object that cannot be read at all means the file is
  // past saving, because every number a student sees comes out of it.
  if (isRecord(state['settings'])) {
    const settings = { ...state['settings'] };
    for (const key of REMOVED_SETTINGS) delete settings[key];
    const checked = validateSettings(settings);
    if (!checked.ok) return null;
    state['settings'] = checked.settings;
  } else {
    return null;
  }

  if (isRecord(state['teams'])) {
    const teams: Record<string, unknown> = {};
    for (const [teamId, team] of Object.entries(state['teams'])) {
      if (!isRecord(team)) continue;
      const copy = { ...team };
      for (const key of REMOVED_TEAM_FIELDS) delete copy[key];
      teams[teamId] = copy;
    }
    state['teams'] = teams;
  }

  state['messages'] = messagesFrom(state['messages']);
  state['messaging'] = messagingFrom(state['messaging']);
  delete state['news'];

  // A demand event that was fired in v1 has nothing left to do, so the record
  // of it goes: the debrief has no marker for it any more.
  if (Array.isArray(state['firedEvents'])) {
    state['firedEvents'] = state['firedEvents'].filter(
      (fired) => isRecord(fired) && fired['kind'] === 'newProducer',
    );
  }

  return state as unknown as SessionState;
}
