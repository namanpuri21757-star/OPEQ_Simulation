import type { DebriefData } from '@shared/debrief';
import { formatProfitK } from '@shared/units';
import { DataTable } from '../ui';

/**
 * The Leaderboard (SPEC 8.4): countries by total profit across every world, and
 * worlds by what the three of them made together.
 *
 * It is deliberately the fourth screen of five. Shown first, a room talks about
 * who won; shown after the comparison, the second table is the interesting one,
 * because a country can be top of it and still be in the world that kept the
 * least. No row is labelled a loser (CLAUDE.md rule 8).
 */
export interface LeaderboardProps {
  debrief: DebriefData;
}

export function Leaderboard({ debrief }: LeaderboardProps) {
  const { countries, worlds } = debrief.leaderboard;

  return (
    <section className="debrief-screen" aria-labelledby="leaderboard-heading">
      <h2 id="leaderboard-heading">{debrief.titles.leaderboard}</h2>
      <p className="debrief-lead">
        A country can earn the most in the class and still be in the world that left the most money
        on the table. Both tables are worth reading.
      </p>

      <DataTable
        caption="Every country, by total profit"
        columns={['Place', 'Country', 'Total profit']}
        rows={countries.map((row, index) => [
          String(index + 1),
          row.label,
          formatProfitK(row.cumulativeProfitK),
        ])}
        rowHeader={1}
      />

      <DataTable
        caption="Every world, by what the three countries made together"
        columns={['World', 'Total profit', 'Share of the best possible']}
        rows={worlds.map((row) => [
          row.label,
          formatProfitK(row.totalProfitK),
          `${String(row.percentOfMax)}%`,
        ])}
      />
    </section>
  );
}
