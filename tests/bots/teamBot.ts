/**
 * A robot that plays one country.
 *
 * The strategies are the behaviours a class actually shows, so a simulated game
 * exercises the same code paths a real lesson does: groups that keep the deal,
 * groups that never do, one that agrees and then cheats, one that always submits
 * at the last second, and one on a flaky school laptop.
 *
 * A bot only ever reads its own view, which is also a check in itself: if a bot
 * can work out another world's numbers, so could a student.
 */

import { GameClient } from '../support/client.js';
import type { Ack } from '../../src/shared/protocol.js';

export const STRATEGIES = [
  'cooperative',
  'competitive',
  'cheater',
  'random',
  'titForTat',
  'lateSubmitter',
  'flaky',
] as const;
export type Strategy = (typeof STRATEGIES)[number];

interface PublicSettings {
  a: number;
  b: number;
  cost: number;
  capacity: number;
  capacityTenths: number;
  disclosure: string;
}

interface YearRow {
  year: number;
  isPractice: boolean;
  ownActualTenths: number;
  others: Array<{ actualTenths: number | null }> | null;
}

export interface TeamBotOptions {
  url: string;
  sessionId: string;
  joinCode: string;
  strategy: Strategy;
  name: string;
  members?: string[];
  /** Any whole number: two bots with the same seed make the same choices. */
  seed?: number;
}

export class TeamBot {
  readonly client: GameClient;
  readonly strategy: Strategy;
  teamId: string | null = null;
  private random: () => number;

  constructor(private readonly options: TeamBotOptions) {
    this.client = new GameClient(options.url, options.name);
    this.strategy = options.strategy;
    this.random = mulberry(options.seed ?? 1);
  }

  get view(): Record<string, unknown> {
    return this.client.view;
  }

  private get settings(): PublicSettings {
    const settings = this.view['settings'] as PublicSettings | undefined;
    return (
      settings ?? { a: 70, b: 0.3, cost: 1, capacity: 75, capacityTenths: 750, disclosure: 'full' }
    );
  }

  async join(): Promise<void> {
    await this.client.hello({ role: 'team', sessionId: this.options.sessionId });
    const ack = await this.client.send('claimTeam', { joinCode: this.options.joinCode });
    if (!ack.ok) throw new Error(`${this.options.name}: ${ack.message}`);
    const result = ack.result as { teamId: string; token: string };
    this.teamId = result.teamId;
    this.client.teamId = result.teamId;
    this.client.token = result.token;
    await this.client.send('setMembers', {
      names: this.options.members ?? ['Ada', 'Ben', 'Cleo'],
    });
  }

  /** Reconnects with the saved token, the way a terminal does after a drop. */
  async reconnect(): Promise<void> {
    this.client.disconnect();
    const token = this.client.token;
    await this.client.connect();
    await this.client.hello({
      role: 'team',
      sessionId: this.options.sessionId,
      ...(token ? { teamToken: token } : {}),
    });
  }

  // -------------------------------------------------------------------------
  // Deciding.
  // -------------------------------------------------------------------------

  /** An equal share of the best total for the three together, in tenths. */
  private cooperativeShareTenths(): number {
    const { a, b, cost } = this.settings;
    return Math.round(((a - cost) / (2 * b) / 3) * 10);
  }

  /** What everyone playing their best response at once gives, in tenths. */
  private competitiveTenths(): number {
    const { a, b, cost } = this.settings;
    return Math.round(((a - cost) / (4 * b)) * 10);
  }

  /** The best answer to the other two sticking to the cartel share. */
  private cheatTenths(): number {
    const { a, b, cost } = this.settings;
    const others = (this.cooperativeShareTenths() * 2) / 10;
    return Math.round(((a - cost - b * others) / (2 * b)) * 10);
  }

  /** The highest output any other country managed last year, if it is visible. */
  private highestOtherTenths(): number | null {
    const history = (this.view['history'] as YearRow[] | undefined) ?? [];
    const last = history[history.length - 1];
    if (!last?.others) return null;
    const values = last.others
      .map((row) => row.actualTenths)
      .filter((value): value is number => value !== null);
    return values.length === 0 ? null : Math.max(...values);
  }

  /** The number this bot wants to produce this year, in whole tenths. */
  decide(): number {
    const cap = this.settings.capacityTenths;
    const clamp = (value: number) => Math.max(0, Math.min(cap, Math.round(value)));

    switch (this.strategy) {
      case 'competitive':
        return clamp(this.competitiveTenths());
      case 'cheater':
        // Honest in the first two years, then takes the extra barrels.
        return clamp(this.client.year <= 2 ? this.cooperativeShareTenths() : this.cheatTenths());
      case 'random':
        return clamp(this.random() * cap);
      case 'titForTat': {
        const highest = this.highestOtherTenths();
        return clamp(highest ?? this.cooperativeShareTenths());
      }
      case 'cooperative':
      case 'lateSubmitter':
      case 'flaky':
      default:
        return clamp(this.cooperativeShareTenths());
    }
  }

  // -------------------------------------------------------------------------
  // Playing.
  // -------------------------------------------------------------------------

  /** Everything a group does during an open year, in the order a group does it. */
  async playOpenYear(): Promise<Ack> {
    if (this.strategy === 'flaky') await this.reconnect();

    const tenths = this.decide();

    await this.client.send('recordHuddle', {
      suggestions: [
        { name: 'Ada', tenths },
        { name: 'Ben', tenths: Math.max(0, tenths - 20) },
      ],
      reason: 'We talked it over and this felt fair.',
    });

    const ack = await this.client.send('submitDecision', { tenths });

    if (ack.ok) {
      await this.client.send('submitPrediction', {
        othersTenths: [this.cooperativeShareTenths(), this.cooperativeShareTenths()],
        trust: this.strategy === 'cooperative' ? 5 : 2,
      });
    }

    if (this.strategy === 'lateSubmitter') {
      // A group that keeps tinkering: the last number before closing counts.
      await this.client.send('submitDecision', { tenths: Math.max(0, tenths - 5) });
    }
    return ack;
  }

  /** What a bot says during a chat window or a summit. */
  async talk(): Promise<void> {
    const share = this.cooperativeShareTenths();
    if (this.strategy === 'competitive' || this.strategy === 'random') {
      await this.client.send('sendMessage', { text: 'We will do what is best for us.' });
      return;
    }
    await this.client.send('sendPledge', { tenths: share });
  }

  async reflect(): Promise<void> {
    await this.client.send('submitReflection', {
      answers: [
        'We worked together best in the first few years.',
        'One promise was broken and we talked about it.',
        'Next time we would agree a number and stick to it.',
      ],
    });
  }

  close(): void {
    this.client.close();
  }
}

/** A tiny repeatable generator, so a "random" bot is still reproducible. */
function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
