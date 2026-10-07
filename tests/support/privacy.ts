/**
 * The deep payload scan, in one place.
 *
 * It was written for the integration suite in Phase 3, and acceptance I1 runs
 * exactly the same scan over the payloads a real browser received during the
 * end-to-end game. Keeping one implementation means the two can never drift,
 * and a leak that only appears in a browser is still caught by the same rules.
 *
 * The scan works on strings rather than on view shapes on purpose: it does not
 * need to know what a view looks like, so a field added to a view tomorrow is
 * searched too.
 */

import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import type { SessionState } from '../../src/shared/state.js';

export interface PrivacyLeak {
  /** Which screen was sent it. */
  who: string;
  /** The string that should not have been there. */
  needle: string;
  /** What kind of thing it was, for a readable failure message. */
  what: string;
}

interface Secret {
  needle: string;
  what: string;
}

/** Only strings long enough that a chance match is not credible. */
const MIN_LENGTH = 4;

function dedupe(secrets: Secret[]): Secret[] {
  const seen = new Map<string, Secret>();
  for (const secret of secrets) {
    if (secret.needle.length < MIN_LENGTH) continue;
    if (!seen.has(secret.needle)) seen.set(secret.needle, secret);
  }
  return [...seen.values()];
}

/** Every string a given team must never be sent. */
export function secretsForTeam(state: SessionState, teamId: string): Secret[] {
  const me = state.teams[teamId];
  if (!me) throw new Error(`There is no team ${teamId} in this session.`);

  const out: Secret[] = [
    { needle: state.instructorKey, what: 'the instructor key' },
    { needle: state.projectorKey, what: 'the projector key' },
  ];

  for (const world of state.worlds) {
    if (world.worldId === me.worldId) continue;
    out.push({ needle: world.worldId, what: `another world's id (${world.worldId})` });
    for (const letter of COUNTRY_LETTERS) {
      out.push({
        needle: `${world.worldId}-${letter}`,
        what: `another world's team id (${world.worldId}-${letter})`,
      });
    }
  }

  for (const other of Object.values(state.teams)) {
    if (other.teamId === me.teamId) continue;
    out.push({ needle: other.joinCode, what: `another team's join code (${other.teamId})` });
    if (other.token) {
      out.push({ needle: other.token, what: `another team's terminal token (${other.teamId})` });
    }
    // Same-world chat is shared on purpose; nobody else's huddle notes,
    // reasons, predictions or reflections ever are (SPEC section 7).
    for (const huddle of Object.values(other.huddles)) {
      out.push({ needle: huddle.reason, what: `another team's huddle reason (${other.teamId})` });
    }
    if (other.reflection) {
      for (const answer of other.reflection.answers) {
        out.push({ needle: answer, what: `another team's reflection (${other.teamId})` });
      }
    }
  }

  for (const message of state.messages) {
    if (message.worldId !== null && message.worldId !== me.worldId) {
      out.push({ needle: message.text, what: `another world's message` });
    }
  }

  return dedupe(out);
}

export interface ProjectorScanOptions {
  /**
   * The worlds whose detail screen the teacher deliberately put on the
   * projector, by worldId.
   *
   * SPEC section 7 says the room never sees chat; SPEC 8.4 and 8.5 say World
   * Detail carries a world's message timeline and that the room sees whatever
   * the teacher sends. Both hold at once only in one way: during play the room
   * sees no chat at all, and after the game it sees the one world the teacher
   * chose to show it. Leave this empty for the during-play scan, which is the
   * strict one.
   */
  shownWorldIds?: readonly string[];
}

/**
 * Every string the projector must never be sent.
 *
 * Keys, join codes and terminal tokens are never allowed. Nor is a huddle
 * reason or a reflection, because no screen the teacher can mirror draws
 * either. A team message is allowed only for a world in `shownWorldIds`.
 */
export function secretsForProjector(
  state: SessionState,
  options: ProjectorScanOptions = {},
): Secret[] {
  const shown = new Set(options.shownWorldIds ?? []);
  const out: Secret[] = [
    { needle: state.instructorKey, what: 'the instructor key' },
    { needle: state.projectorKey, what: 'the projector key' },
  ];

  for (const team of Object.values(state.teams)) {
    out.push({ needle: team.joinCode, what: `a join code (${team.teamId})` });
    if (team.token) out.push({ needle: team.token, what: `a terminal token (${team.teamId})` });
    for (const huddle of Object.values(team.huddles)) {
      out.push({ needle: huddle.reason, what: `a huddle reason (${team.teamId})` });
    }
    if (team.reflection) {
      for (const answer of team.reflection.answers) {
        out.push({ needle: answer, what: `a reflection (${team.teamId})` });
      }
    }
  }
  for (const message of state.messages) {
    // An announcement is written by the instructor for the room to read, so it
    // is always allowed.
    if (message.kind === 'announcement') continue;
    if (message.worldId !== null && shown.has(message.worldId)) continue;
    out.push({
      needle: message.text,
      what: shown.size === 0 ? 'a team message' : 'a message from a world that is not on screen',
    });
  }
  return dedupe(out);
}

/**
 * Searches one screen's payloads for anything belonging to someone else.
 *
 * `payloads` is whatever that screen was sent, already turned into one string.
 */
export function scan(who: string, payloads: string, secrets: Secret[]): PrivacyLeak[] {
  const leaks: PrivacyLeak[] = [];
  for (const secret of secrets) {
    if (payloads.includes(secret.needle)) {
      leaks.push({ who, needle: secret.needle, what: secret.what });
    }
  }
  return leaks;
}

/** A failure message a person can act on. */
export function describeLeaks(leaks: PrivacyLeak[]): string {
  return leaks.map((leak) => `${leak.who} was sent ${leak.what}: "${leak.needle}"`).join('\n');
}
