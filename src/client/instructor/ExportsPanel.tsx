import { EXPORT_FILES } from '@shared/exports';
import type { InstructorView } from '@shared/views';

/**
 * The downloads (SPEC 8.4 Exports).
 *
 * Plain links, not buttons that build a file in the browser: the files are built
 * on the instructor's own computer, which is where the data already is, and the
 * browser then saves them with a sensible name. Nothing leaves the machine, and
 * no internet is involved.
 *
 * The links carry the instructor key, which is why this panel only ever appears
 * on the dashboard and never on the projector. It is its own section of the
 * dashboard rather than part of the debrief, so a lesson that was cut short can
 * still be taken away.
 */
export interface ExportsPanelProps {
  view: InstructorView;
}

function exportHref(view: InstructorView, name: string): string {
  return `/api/sessions/${encodeURIComponent(view.sessionId)}/export/${encodeURIComponent(name)}?k=${encodeURIComponent(view.instructorKey)}`;
}

export function ExportsPanel({ view }: ExportsPanelProps) {
  return (
    <section className="box" aria-labelledby="exports-heading">
      <h2 id="exports-heading">Download the results</h2>
      <p className="note">
        The CSV files open in any spreadsheet. The JSON file holds everything, including the
        debrief. Both are saved on this computer only.
      </p>
      <ul className="exports-list">
        {EXPORT_FILES.map((file) => (
          <li key={file.name}>
            <a className="btn" href={exportHref(view, file.name)} download={file.fileName}>
              {file.label}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
