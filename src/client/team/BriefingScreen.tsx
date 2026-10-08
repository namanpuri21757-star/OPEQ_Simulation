import { priceCents, profitK } from '@shared/engine/engine';
import { toCents, toHundredths, toTenths } from '@shared/engine/integers';
import { envoyNames } from '@shared/roles';
import { BRIEFING_SLIDES } from '@shared/state';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import type { PublicSettingsView, TeamView } from '@shared/views';

/**
 * The four briefing screens (SPEC 8.3), in step with the instructor.
 *
 * The terminal never moves itself: it shows whichever slide the teacher is on,
 * so the room is looking at the same thing. There is nothing to click and
 * nothing to answer - the quick check v1 ended each briefing with is gone,
 * because a group that gets a question wrong before the game has started learns
 * nothing from it and the teacher has to wait for nine of them.
 *
 * The worked example is computed from this session's own settings, so it is true
 * for this game and not just for the defaults. It is one fixed example: nothing
 * on this screen lets a group try numbers of their own.
 */
function units(settings: PublicSettingsView) {
  return {
    aCents: toCents(settings.a),
    bHundredths: toHundredths(settings.b),
    costCents: toCents(settings.cost),
    capacityTenths: settings.capacityTenths,
    startingOutputTenths: toTenths(settings.startingOutput),
  };
}

function Story({ view }: { view: TeamView }) {
  return (
    <>
      <h2>You run an oil country</h2>
      <p>
        {`Your group is the Oil Production Board of ${view.countryName}. Two other countries share your market: you are all in World ${String(view.worldNumber)}.`}
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
  const u = units(settings);
  const own = u.startingOutputTenths;
  const total = own * 3;
  const price = priceCents(total, u.aCents, u.bHundredths);
  const profit = profitK(price, u.costCents, own);

  return (
    <>
      <h2>How the price works</h2>
      <p>
        {`The price starts at ${formatPrice(u.aCents)} per barrel and falls by $${String(settings.b)} for every million barrels the whole world produces.`}
      </p>
      <div className="briefing-example">
        <p>{`World production: ${formatQuantity(total)} million barrels`}</p>
        <p>{`Price = ${formatPrice(u.aCents)} - $${String(settings.b)} x ${formatQuantity(total)} = ${formatPrice(price)} per barrel`}</p>
        <p>{`Your output: ${formatQuantity(own)} million barrels`}</p>
        <p>{`Your profit = (${formatPrice(price)} - ${formatPrice(u.costCents)}) x ${formatQuantity(own)} = ${formatProfitK(profit)}`}</p>
      </div>
      <p>
        {`${formatPrice(u.costCents)} is what each barrel costs you to lift. Your capacity is ${formatQuantity(u.capacityTenths)} million barrels, so that is the most you can choose.`}
      </p>
    </>
  );
}

function Roles({ view }: { view: TeamView }) {
  const envoys = envoyNames(view.roles);
  return (
    <>
      <h2>Who does what</h2>
      <ul>
        <li>
          <strong>Operator</strong> sits at the keyboard and types the number your group agrees on.
        </li>
        <li>
          <strong>Envoy</strong> writes the messages and goes to the meeting at a summit.
        </li>
      </ul>
      <p>{`The jobs move around every ${String(view.settings.rotateEvery)} years, so everyone has a turn.`}</p>
      {view.members.length > 0 && (
        <p>{`This year: Operator ${view.roles.operator}${envoys === '' ? '' : `, Envoy ${envoys}`}.`}</p>
      )}
    </>
  );
}

function HowAYearWorks() {
  return (
    <>
      <h2>How a year works</h2>
      <ol>
        <li>Your teacher opens the year and a timer starts.</li>
        <li>Your group agrees on a number and the Operator submits it.</li>
        <li>You can change the number until the timer stops. The last one counts.</li>
        <li>
          If you send nothing, your country produces what it produced last year, and the screen says
          it was filled in for you.
        </li>
        <li>Everyone sees the price, and you see your own profit and your total so far.</li>
        <li>
          Sometimes your teacher turns messaging on, or calls a summit where the Envoys meet in the
          room.
        </li>
      </ol>
      <p>There is a practice year first. It does not count.</p>
    </>
  );
}

export function BriefingScreen({ view }: { view: TeamView }) {
  const slide = Math.min(Math.max(0, view.briefingSlide), BRIEFING_SLIDES - 1);
  return (
    <section className="box" aria-labelledby="briefing-heading">
      <div className="box-head">
        <span className="label label-muted" id="briefing-heading">
          {`Briefing · Screen ${String(slide + 1)} of ${String(BRIEFING_SLIDES)}`}
        </span>
        <span className="label label-muted">Your teacher moves these screens on</span>
      </div>
      <div className="briefing-body">
        {slide === 0 && <Story view={view} />}
        {slide === 1 && <Price view={view} />}
        {slide === 2 && <Roles view={view} />}
        {slide === 3 && <HowAYearWorks />}
      </div>
    </section>
  );
}
