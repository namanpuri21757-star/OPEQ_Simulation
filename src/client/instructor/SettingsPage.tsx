import { useMemo } from 'react';
import { APP_NAME } from '@shared/constants';
import type { InstructorView } from '@shared/views';
import {
  RoleConnection,
  browserStore,
  readInstructor,
  useView,
  type KeyValueStore,
} from '../net';
import { Toast, useToast } from '../ui';
import { SetupScreen } from './SetupScreen';

/**
 * /instructor/settings: the lesson settings on a page of their own (SPEC 8.4).
 *
 * It is a route rather than a section of the start screen so that the start
 * screen can be exactly the five things a teacher has to do. A teacher who never
 * opens this page gets the standard lesson, which is the point.
 */
export interface SettingsPageProps {
  store?: KeyValueStore;
}

export default function SettingsPage({ store }: SettingsPageProps) {
  const keyValue = useMemo(() => store ?? browserStore(), [store]);
  const saved = useMemo(() => readInstructor(keyValue), [keyValue]);

  if (saved === null) {
    return (
      <main className="sheet">
        <header className="teacher-band">
          <h1 className="teacher-title">{APP_NAME}</h1>
        </header>
        <section className="box">
          <p className="lede">
            No game is open on this computer yet. Open the dashboard first, then come back.
          </p>
        </section>
      </main>
    );
  }

  return (
    <RoleConnection sessionId={saved.sessionId} role="instructor" authKey={saved.instructorKey}>
      <LiveSettings />
    </RoleConnection>
  );
}

function LiveSettings() {
  const { view, send } = useView<InstructorView>();
  const { message, say } = useToast();

  if (view === null || view.kind !== 'instructor') {
    return (
      <main className="sheet">
        <header className="teacher-band">
          <h1 className="teacher-title">Lesson settings</h1>
        </header>
        <section className="box">
          <p role="status">Opening the settings...</p>
        </section>
      </main>
    );
  }

  return (
    <>
      <SetupScreen view={view} send={send} onSaid={say} />
      <Toast message={message} />
    </>
  );
}
