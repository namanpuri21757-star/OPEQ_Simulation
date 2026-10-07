import type { MaterialBlock, MaterialDoc } from '@shared/materials';
import { DataTable } from '../ui';

/**
 * One classroom material on screen, ready to print (SPEC 8.4 Materials).
 *
 * The same documents that `npm run benchmarks` writes into docs/materials, from
 * the same builders, so what a teacher prints from here and what is in the repo
 * cannot disagree. Here they are built from the live session's settings, so the
 * worked example matches the game the class is about to play.
 */
function Block({ block }: { block: MaterialBlock }) {
  switch (block.kind) {
    case 'heading':
      return <h3>{block.text}</h3>;
    case 'subheading':
      return <h4>{block.text}</h4>;
    case 'paragraph':
      return <p>{block.text}</p>;
    case 'bullets':
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol>
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case 'note':
      return <p className="material-note">{block.text}</p>;
    case 'formula':
      return <p className="material-formula">{block.text}</p>;
    case 'table':
      return <DataTable caption={block.caption} columns={block.columns} rows={block.rows} />;
    default: {
      const never: never = block;
      return <p>{String(never)}</p>;
    }
  }
}

export interface MaterialDocViewProps {
  doc: MaterialDoc;
}

export function MaterialDocView({ doc }: MaterialDocViewProps) {
  return (
    <article className="material" id={doc.slug} aria-labelledby={`${doc.slug}-heading`}>
      <h2 id={`${doc.slug}-heading`}>{doc.title}</h2>
      <p className="material-intro">{doc.intro}</p>
      {doc.blocks.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </article>
  );
}
