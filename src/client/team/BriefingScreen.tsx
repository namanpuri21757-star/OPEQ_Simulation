import { priceCents, profitK } from '@shared/engine/engine';
import { BRIEFING_SLIDES } from '@shared/state';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import type { TeamView } from '@shared/views';
import { BriefingCheck } from './BriefingCheck';
import { clientUnits } from './economics';

/**
 * The four briefing screens (SPEC 8.3), in step with the instructor.
 *
 * The terminal never moves itself: it shows whichever slide the teacher is on, so
 * the room is looking at the same thing. The worked example is computed from this
 * session's settings, so it is true for this game and not just for the defaults.
 */
function Story({ view }: { view: TeamView }) {
  return (
    <>
      <h2>You run an oil country</h2>
      <p>
        {`Your group is the Oil Production Board of ${view.countryName}. Two other countries share the same market with you: you are all in ${view.label.split(' - ')[0] ?? 'your world'}.`}
      </p>
      <p>
        Every year each country decides how many million barrels to produce. All the barrels go to
        one world market, and one price comes out of it.
      </p>
      <p>
        Your aim is simple to say and hard to do: earn the most money for your own country, added up
        over the whole game.
      </p>
    </>
  );
}

function Price({ view }: { view: TeamView }) {
  const settings = view.settings;
  const units = clientUnits(settings);
  const own = units.startingOutputTenths;
  const total = own * 3;
  const price = priceCents(total, units.aCents, units.bHundredths);
  const profit = profitK(price, units.costCents, own);

  return (
    <>
      <h2>How the price works</h2>
      <p>
        {`The price starts at ${formatPrice(units.aCents)} and falls by $${String(settings.b)} for every million barrels the whole world produces.`}
      </p>
      <p className="worked">
        {`If the world produces ${formatQuantity(total)} million barrels, the price is ${formatPrice(units.aCents)} - $${String(settings.b)} x ${formatQuantity(total)} = ${formatPrice(price)} a barrel.`}
      </p>
      <p className="worked">
        {`If you produced ${formatQuantity(own)} million barrels, your profit is (${formatPrice(price)} - ${formatPrice(units.costCents)}) x ${formatQuantity(own)} = ${formatProfitK(profit)}.`}
      </p>
      <p>
        {`${formatPrice(units.costCents)} is what each barrel costs you to produce. Your capacity is ${formatQuantity(units.capacityTenths)} million barrels, so that is the most you can choose.`}
      </p>
    </>
  );
}

function Roles({ view }: { view: TeamView }) {
  return (
    <>
      <h2>Who does what</h2>
      <ul className="briefing-roles">
        <li>
          <strong>Operator</strong> sits at the keyboard and types the number your group agrees on.
        </li>
        <li>
          <strong>Analyst</strong> uses the What-if calculator and guesses what the others will do.
        </li>
        <li>
          <strong>Envoy</strong> writes the messages and goes to the meeting at a summit.
        </li>
      </ul>
      <p>{`The jobs move around every ${String(view.settings.rotateEvery)} years, so everyone has a turn.`}</p>
      {view.members.length > 0 && (
        <p>{`This year: Operator ${view.roles.operator}, Analyst ${view.roles.analysts.join(' and ')}, Envoy ${view.roles.envoy}.`}</p>
      )}
    </>
  );
}

function HowAYearWorks() {
  return (
    <>
      <h2>How a year works</h2>
      <ol className="briefing-steps">
        <li>Your teacher opens the year and a timer starts.</li>
        <li>Your group agrees on a number and the Operator submits it.</li>
        <li>You can change the number until the timer stops. The last one counts.</li>
        <li>
          If you send nothing, your country produces what it produced last year, and the screen says
          it was filled in for you.
        </li>
        <li>
          Everyone sees the price and their own profit. Sometimes there is time to talk first, or a
          summit where Envoys meet.
        </li>
      </ol>
      <p>There is a practice year first. It does not count.</p>
    </>
  );
}

export function BriefingScreen({ view }: { view: TeamView }) {
  const slide = Math.min(Math.max(0, view.briefingSlide), BRIEFING_SLIDES - 1);
  return (
    <>
      <section className="panel briefing" aria-labelledby="briefing-heading">
        <p className="briefing-count" id="briefing-heading">
          {`Briefing, screen ${String(slide + 1)} of ${String(BRIEFING_SLIDES)}`}
        </p>
        {slide === 0 && <Story view={view} />}
        {slide === 1 && <Price view={view} />}
        {slide === 2 && <Roles view={view} />}
        {slide === 3 && <HowAYearWorks />}
        <p className="hint">Your teacher moves these screens on.</p>
      </section>

      {slide === BRIEFING_SLIDES - 1 && <BriefingCheck settings={view.settings} />}
    </>
  );
}
