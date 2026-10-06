/**
 * A robot instructor that only ever presses the one suggested button.
 *
 * That is deliberate: if a whole game can be run by following
 * nextSuggestedAction, then the schedule in the settings really does drive the
 * lesson, and a teacher who is busy with the room cannot get lost.
 */

import { GameClient } from '../support/client.js';
import type { Ack, CommandType } from '../../src/shared/protocol.js';
import type { Phase } from '../../src/shared/state.js';

interface Suggested {
  command: CommandType | null;
  label: string;
  payload: Record<string, unknown>;
  expectedPhase: Phase;
  expectedYear: number;
}

export class InstructorBot {
  readonly client: GameClient;
  /** Every label the dashboard offered, in order. Useful in a failure message. */
  readonly steps: string[] = [];

  constructor(
    url: string,
    private readonly sessionId: string,
    private readonly instructorKey: string,
    name = 'instructor-bot',
  ) {
    this.client = new GameClient(url, name);
  }

  async join(): Promise<void> {
    const result = await this.client.hello({
      role: 'instructor',
      sessionId: this.sessionId,
      instructorKey: this.instructorKey,
    });
    if (!result.ok) throw new Error(`instructor bot: ${result.message}`);
  }

  get suggested(): Suggested | null {
    return (this.client.view['suggested'] as Suggested | undefined) ?? null;
  }

  get phase(): Phase {
    return this.client.phase;
  }

  get year(): number {
    return this.client.year;
  }

  /** Presses the big button once. Returns null when there is nothing to press. */
  async step(): Promise<Ack | null> {
    const suggested = this.suggested;
    if (!suggested?.command) return null;
    this.steps.push(suggested.label);
    return this.client.send(suggested.command, suggested.payload, {
      expectedPhase: suggested.expectedPhase,
      expectedYear: suggested.expectedYear,
    });
  }

  /** Presses it until the phase changes, so callers do not have to poll. */
  async stepUntilPhaseChanges(limit = 10): Promise<void> {
    const from = this.phase;
    for (let i = 0; i < limit; i += 1) {
      const ack = await this.step();
      if (!ack) return;
      if (!ack.ok) throw new Error(`instructor bot could not continue: ${ack.message}`);
      await this.client.waitForView((view) => view['version'] === ack.version, 'the next view');
      if (this.phase !== from) return;
    }
  }

  async send(type: CommandType, payload: unknown = {}): Promise<Ack> {
    return this.client.send(type, payload);
  }

  close(): void {
    this.client.close();
  }
}
