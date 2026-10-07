import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { APP_NAME } from '@shared/constants';
import { materialsFor } from '@shared/materials';
import { DEFAULT_SETTINGS, type Settings } from '@shared/settings';
import type { InstructorView } from '@shared/views';
import { RoleConnection, browserStore, readInstructor, useView, type KeyValueStore } from '../net';
import { Button } from '../ui';
import { MaterialDocView } from './MaterialDocView';

/**
 * /instructor/materials (SPEC 8.4): the handouts, on screen and printable.
 *
 * It works with or without a game running. With one, every number comes from
 * that session's settings, so the briefing a class reads matches the game it is
 * about to play. Without one, it shows the standard settings, so a teacher can
 * print the handouts the night before.
 *
 * `?doc=role-cards` prints one of them on its own, which is what the links at
 * the top do.
 */
export interface MaterialsPageProps {
  store?: KeyValueStore;
}

export default function MaterialsPage({ store }: MaterialsPageProps) {
  const keyValue = useMemo(() => store ?? browserStore(), [store]);
  const saved = useMemo(() => readInstructor(keyValue), [keyValue]);

  if (saved === null) return <Materials settings={DEFAULT_SETTINGS} live={false} />;

  return (
    <RoleConnection sessionId={saved.sessionId} role="instructor" authKey={saved.instructorKey}>
      <LiveMaterials />
    </RoleConnection>
  );
}

/** Only the route reads the context; the page itself takes settings. */
function LiveMaterials() {
  const { view } = useView<InstructorView>();
  const live = view !== null && view.kind === 'instructor';
  return <Materials settings={live ? view.settings : DEFAULT_SETTINGS} live={live} />;
}

export interface MaterialsProps {
  settings: Settings;
  /** True when the numbers came from a game running on this computer. */
  live: boolean;
}

export function Materials({ settings, live }: MaterialsProps) {
  const [params, setParams] = useSearchParams();
  const wanted = params.get('doc');
  const docs = materialsFor(settings);
  const showing = docs.filter((doc) => wanted === null || doc.slug === wanted);

  return (
    <main className="page page-materials">
      <header className="materials-toolbar">
        <div>
          <h1>{APP_NAME} materials</h1>
          <p className="hint">
            {live
              ? 'Every number below comes from the settings of the game on this computer.'
              : 'No game is open on this computer, so these use the standard settings.'}
          </p>
        </div>
        <Button
          onClick={() => {
            window.print();
          }}
        >
          Print
        </Button>
      </header>

      <nav className="materials-nav" aria-label="Materials">
        <Button
          tone={wanted === null ? 'primary' : 'secondary'}
          onClick={() => {
            setParams({});
          }}
        >
          All of them
        </Button>
        {docs.map((doc) => (
          <Button
            key={doc.slug}
            tone={wanted === doc.slug ? 'primary' : 'secondary'}
            onClick={() => {
              setParams({ doc: doc.slug });
            }}
          >
            {doc.title}
          </Button>
        ))}
      </nav>

      {showing.length === 0 ? (
        <p role="status">{`There is no material called "${String(wanted)}".`}</p>
      ) : (
        showing.map((doc) => <MaterialDocView key={doc.slug} doc={doc} />)
      )}
    </main>
  );
}
