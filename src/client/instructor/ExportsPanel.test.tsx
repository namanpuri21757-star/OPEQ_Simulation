import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EXPORT_FILES } from '@shared/exports';
import { INSTRUCTOR_KEY, instructorView } from '../../../tests/support/instructorView';
import { ExportsPanel } from './ExportsPanel';

/**
 * The downloads.
 *
 * They are plain links to the server, so the only things worth checking are
 * that every file is offered, that each link carries the instructor key and a
 * file name, and that nothing here tries to build a file in the browser.
 */
describe('the downloads', () => {
  it('offers all seven files', () => {
    render(<ExportsPanel view={instructorView({ phase: 'ENDED' })} />);
    for (const file of EXPORT_FILES) {
      expect(screen.getByRole('link', { name: file.label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('link')).toHaveLength(7);
  });

  it('points each link at this session, with the instructor key', () => {
    render(<ExportsPanel view={instructorView({ phase: 'ENDED' })} />);
    const link = screen.getByRole('link', { name: 'Decisions (CSV)' });
    expect(link.getAttribute('href')).toBe(
      `/api/sessions/session-demo/export/decisions?k=${INSTRUCTOR_KEY}`,
    );
    expect(link.getAttribute('download')).toBe('decisions.csv');
  });

  it('has no button to press, because a download is a link', () => {
    render(<ExportsPanel view={instructorView({ phase: 'ENDED' })} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
