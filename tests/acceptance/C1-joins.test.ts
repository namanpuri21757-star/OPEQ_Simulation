/**
 * C1 - everybody arrives at once.
 *
 * The first two minutes of a lesson are the riskiest part of the whole thing:
 * nine groups open the same page at the same moment, the projector goes up and
 * the teacher opens the dashboard. This test does that, in parallel, and
 * measures the two things a teacher would notice - how long the room takes to
 * be connected, and how long a group waits to see its own country.
 *
 * Real wall-clock time, not the test clock: the numbers in the pass criterion
 * are about what a person experiences.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import type { ClaimTeamResult } from '../../src/shared/protocol.js';
import { GameClient } from '../support/client.js';
import { newSession, startServer, type Harness } from '../support/harness.js';

/** The whole room connected, in seconds. */
const ALL_CONNECTED_LIMIT_MS = 10_000;
/** How long one group waits to know which country it is, in seconds. */
const OWN_COUNTRY_LIMIT_MS = 2_000;

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('C1 - nine terminals, the instructor and the projector all connect at once', () => {
  it('has the whole room in within 10 s, each group knowing its country within 2 s', async () => {
    const session = await newSession(harness, { settings: { worlds: 3 } });
    expect(session.teams).toHaveLength(9);

    const started = Date.now();

    // One promise per screen, all started before any of them is awaited, so
    // the server really does see eleven arrivals in the same instant.
    const joins = session.teams.map(async (team) => {
      const client = new GameClient(harness.url, team.teamId);
      harness.track(client);
      const hello = await client.hello({ role: 'team', sessionId: session.sessionId });
      if (!hello.ok) throw new Error(`${team.teamId} could not say hello: ${hello.message}`);
      const askedAt = Date.now();
      const ack = await client.send('claimTeam', { joinCode: team.joinCode });
      if (!ack.ok) throw new Error(`${team.teamId} could not claim: ${ack.message}`);
      const result = ack.result as ClaimTeamResult;
      client.teamId = result.teamId;
      client.token = result.token;
      // "Shows its correct team" is the moment this screen has a view of its
      // own country to draw, not merely the moment the ack came back.
      await client.waitForView((view) => view['kind'] === 'team', 'its own country view');
      return {
        client,
        team,
        result,
        ownCountryMs: Date.now() - askedAt,
        view: client.view,
      };
    });

    const projectorJoin = (async () => {
      const client = new GameClient(harness.url, 'projector');
      harness.track(client);
      const hello = await client.hello({
        role: 'projector',
        sessionId: session.sessionId,
        projectorKey: session.projectorKey,
      });
      if (!hello.ok) throw new Error(`the projector could not say hello: ${hello.message}`);
      await client.waitForView((view) => view['kind'] === 'projector', 'the room screen');
      return client;
    })();

    const dashboardJoin = (async () => {
      const client = new GameClient(harness.url, 'second-dashboard');
      harness.track(client);
      const hello = await client.hello({
        role: 'instructor',
        sessionId: session.sessionId,
        instructorKey: session.instructorKey,
      });
      if (!hello.ok) throw new Error(`the dashboard could not say hello: ${hello.message}`);
      await client.waitForView((view) => view['kind'] === 'instructor', 'the dashboard');
      return client;
    })();

    const [joined, projector, dashboard] = await Promise.all([
      Promise.all(joins),
      projectorJoin,
      dashboardJoin,
    ]);
    const allConnectedMs = Date.now() - started;

    expect(allConnectedMs).toBeLessThan(ALL_CONNECTED_LIMIT_MS);

    // Every group got its own country, and the right one.
    for (const entry of joined) {
      expect(entry.result.teamId).toBe(entry.team.teamId);
      expect(entry.result.worldNumber).toBe(entry.team.worldNumber);
      expect(entry.result.letter).toBe(entry.team.letter);
      expect(entry.view['teamId']).toBe(entry.team.teamId);
      expect(entry.view['label']).toBe(entry.result.label);
      expect(
        entry.ownCountryMs,
        `${entry.team.teamId} waited ${String(entry.ownCountryMs)} ms to see its country`,
      ).toBeLessThan(OWN_COUNTRY_LIMIT_MS);
    }

    // Nine different countries, not the same one nine times.
    expect(new Set(joined.map((entry) => entry.result.teamId)).size).toBe(9);
    expect(new Set(joined.map((entry) => entry.result.token)).size).toBe(9);

    // Three worlds of three, each world complete.
    for (let worldNumber = 1; worldNumber <= 3; worldNumber += 1) {
      const letters = joined
        .filter((entry) => entry.result.worldNumber === worldNumber)
        .map((entry) => entry.result.letter)
        .sort();
      expect(letters).toEqual([...COUNTRY_LETTERS]);
    }

    expect(projector.view['kind']).toBe('projector');
    expect(dashboard.view['kind']).toBe('instructor');

    // The dashboard agrees that all nine are connected.
    const dashboardView = await dashboard.waitForView((view) => {
      const teams = view['teams'] as Array<{ connected: boolean }> | undefined;
      return teams?.length === 9 && teams.every((team) => team.connected);
    }, 'all nine countries connected on the dashboard');
    expect((dashboardView['screens'] as { projector: number }).projector).toBe(1);
  });
});
