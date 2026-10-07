/**
 * The four links a lesson needs, all built from where this page came from.
 *
 * Nothing here knows the port or the address: the instructor's browser reached
 * the server somehow, and every other computer in the room can reach it the same
 * way. That is also why there is no configuration to get wrong on the day.
 */

export interface SessionKeys {
  sessionId: string;
  instructorKey: string;
  projectorKey: string;
}

/** Where this page came from, for example "http://192.168.1.20:3000". */
export function origin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}

/**
 * The instructor's own link, key included (SPEC section 9).
 *
 * It exists so the teacher can reopen the dashboard after closing the tab, and
 * it is the one link that must never reach the projector or a terminal.
 */
export function instructorLink(keys: SessionKeys, base = origin()): string {
  return `${base}/instructor?s=${encodeURIComponent(keys.sessionId)}&k=${encodeURIComponent(keys.instructorKey)}`;
}

/** The projector's read-only link, with its own separate key. */
export function projectorLink(keys: SessionKeys, base = origin()): string {
  return `${base}/projector/${encodeURIComponent(keys.sessionId)}?k=${encodeURIComponent(keys.projectorKey)}`;
}

/** What goes on the lobby screen and the projector: no code, no key. */
export function joinLink(base = origin()): string {
  return `${base}/join`;
}

/** The link on a team's printed card, which fills the code in for them. */
export function teamJoinLink(joinCode: string, base = origin()): string {
  return `${base}/join/${joinCode}`;
}

/** The network-check page, which any computer in the room may open. */
export function checkLink(base = origin()): string {
  return `${base}/check`;
}
