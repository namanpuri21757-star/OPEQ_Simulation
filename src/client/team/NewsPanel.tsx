import type { TeamView } from '@shared/views';
import { yearLabel } from '@shared/labels';
import { clockTime } from './MessagesPanel';

/**
 * News and announcements (SPEC 8.3).
 *
 * Newest first, because during a year the group only has time to read the top
 * line. Nothing here is ever a hint about what to produce: it is the world
 * changing around them.
 */
export function NewsPanel({ view }: { view: TeamView }) {
  const items = [...view.news].reverse();
  return (
    <section className="panel news" aria-labelledby="news-heading">
      <h2 id="news-heading">News</h2>
      {items.length === 0 ? (
        <p className="hint">Nothing in the news yet.</p>
      ) : (
        <ul className="news-list">
          {items.map((item) => (
            <li key={item.newsId}>
              <span className="news-when">
                {item.year === 0 ? 'Practice' : yearLabel(item.year)} - {clockTime(item.at)}
              </span>
              <span className="news-text">{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
