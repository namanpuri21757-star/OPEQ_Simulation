import { DataTable } from './DataTable';

/**
 * A small line chart, drawn as plain SVG, with the same numbers in a table
 * underneath (SPEC section 9: a data table behind every chart).
 *
 * Why not a chart library: the numbers here are a handful of years, the table is
 * required anyway, and hand-drawn SVG is the only way to be sure every series is
 * told apart by a marker shape and a dash pattern as well as by colour.
 *
 * Nothing animates, so there is nothing to turn off for prefers-reduced-motion.
 */
export interface ChartPoint {
  x: number;
  y: number;
}

export type ChartMarker = 'circle' | 'square' | 'triangle' | 'diamond' | 'plus' | 'bar';

export interface ChartSeries {
  name: string;
  points: readonly ChartPoint[];
  /** Series on the right axis have their own scale, for a second unit. */
  axis?: 'left' | 'right';
  marker?: ChartMarker;
  dash?: string;
}

/**
 * A moment labelled on the x axis: the year a chat window ran, the year the new
 * producer arrived. Drawn as a dashed line, and also listed under the chart so
 * it reaches a screen reader and survives printing in black and white.
 */
export interface ChartMark {
  x: number;
  label: string;
}

export interface LineChartProps {
  title: string;
  series: readonly ChartSeries[];
  marks?: readonly ChartMark[];
  xLabel: string;
  leftLabel: string;
  rightLabel?: string;
  formatX?: (x: number) => string;
  formatLeft?: (y: number) => string;
  formatRight?: (y: number) => string;
  height?: number;
  /** The line under the chart saying where the numbers came from (FRED style). */
  source?: string;
}

const WIDTH = 640;
const PAD = { top: 16, right: 64, bottom: 44, left: 72 };

function niceTop(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / magnitude) * magnitude;
}

/**
 * The marker shapes, so six series can be told apart with no colour at all
 * (SPEC section 9: never colour alone).
 */
const MARKER_GLYPHS: Record<ChartMarker, string> = {
  circle: '●',
  square: '■',
  triangle: '▲',
  diamond: '◆',
  plus: '➕',
  bar: '━',
};

function marker(kind: ChartSeries['marker'], x: number, y: number) {
  if (kind === 'square') return <rect x={x - 3} y={y - 3} width={6} height={6} />;
  if (kind === 'triangle')
    return <polygon points={`${x},${y - 4} ${x + 4},${y + 3} ${x - 4},${y + 3}`} />;
  if (kind === 'diamond')
    return <polygon points={`${x},${y - 4.4} ${x + 4.4},${y} ${x},${y + 4.4} ${x - 4.4},${y}`} />;
  if (kind === 'plus')
    return <path d={`M${x - 4},${y} h8 M${x},${y - 4} v8`} fill="none" strokeWidth={2} />;
  if (kind === 'bar') return <rect x={x - 4} y={y - 1.4} width={8} height={2.8} />;
  return <circle cx={x} cy={y} r={3.2} />;
}

export function LineChart({
  title,
  series,
  marks = [],
  xLabel,
  leftLabel,
  rightLabel,
  formatX = (x) => String(x),
  formatLeft = (y) => String(y),
  formatRight = (y) => String(y),
  height = 260,
  source,
}: LineChartProps) {
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const left = series.filter((s) => (s.axis ?? 'left') === 'left');
  const right = series.filter((s) => s.axis === 'right');

  const topOf = (list: readonly ChartSeries[]): number =>
    niceTop(Math.max(0, ...list.flatMap((s) => s.points.map((p) => p.y))));
  const leftTop = topOf(left);
  const rightTop = topOf(right);

  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const minX = xs[0] ?? 0;
  const maxX = xs[xs.length - 1] ?? 1;
  const atX = (x: number): number =>
    PAD.left + (maxX === minX ? plotWidth / 2 : ((x - minX) / (maxX - minX)) * plotWidth);
  const atY = (y: number, top: number): number =>
    PAD.top + plotHeight - (top === 0 ? 0 : (y / top) * plotHeight);

  const columns = [xLabel, ...series.map((s) => s.name)];
  const rows = xs.map((x) => [
    formatX(x),
    ...series.map((s) => {
      const point = s.points.find((p) => p.x === x);
      if (!point) return '-';
      return (s.axis ?? 'left') === 'left' ? formatLeft(point.y) : formatRight(point.y);
    }),
  ]);

  return (
    <figure className="figure">
      <figcaption className="chart-title">{title}</figcaption>
      <svg
        className="chart"
        viewBox={`0 0 ${String(WIDTH)} ${String(height)}`}
        role="img"
        aria-label={`${title}. The same numbers are in the table below.`}
      >
        {/* The labelled moments go in first, so no line is hidden behind one. */}
        {marks.map((mark) => (
          <g key={`${String(mark.x)}-${mark.label}`} className="chart-mark">
            <line
              x1={atX(mark.x)}
              y1={PAD.top}
              x2={atX(mark.x)}
              y2={PAD.top + plotHeight}
              strokeDasharray="4 3"
            />
          </g>
        ))}
        {/* The frame and the two end labels of each axis: enough to read the shape. */}
        <line
          className="chart-axis"
          x1={PAD.left}
          y1={PAD.top}
          x2={PAD.left}
          y2={PAD.top + plotHeight}
        />
        <line
          className="chart-axis"
          x1={PAD.left}
          y1={PAD.top + plotHeight}
          x2={PAD.left + plotWidth}
          y2={PAD.top + plotHeight}
        />
        <text className="chart-tick" x={PAD.left - 8} y={PAD.top + 4} textAnchor="end">
          {formatLeft(leftTop)}
        </text>
        <text className="chart-tick" x={PAD.left - 8} y={PAD.top + plotHeight} textAnchor="end">
          {formatLeft(0)}
        </text>
        {right.length > 0 && (
          <>
            <text
              className="chart-tick"
              x={PAD.left + plotWidth + 8}
              y={PAD.top + 4}
              textAnchor="start"
            >
              {formatRight(rightTop)}
            </text>
            <text
              className="chart-tick"
              x={PAD.left + plotWidth + 8}
              y={PAD.top + plotHeight}
              textAnchor="start"
            >
              {formatRight(0)}
            </text>
          </>
        )}
        {xs.map((x) => (
          <text
            key={x}
            className="chart-tick"
            x={atX(x)}
            y={PAD.top + plotHeight + 18}
            textAnchor="middle"
          >
            {formatX(x)}
          </text>
        ))}
        <text
          className="chart-axis-label"
          x={PAD.left + plotWidth / 2}
          y={height - 6}
          textAnchor="middle"
        >
          {xLabel}
        </text>
        {series.map((s, index) => {
          const top = (s.axis ?? 'left') === 'left' ? leftTop : rightTop;
          const path = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${String(atX(p.x))},${String(atY(p.y, top))}`)
            .join(' ');
          return (
            <g key={s.name} className={`chart-series chart-series-${String(index + 1)}`}>
              <path d={path} fill="none" strokeDasharray={s.dash} />
              {s.points.map((p) => (
                <g key={p.x} className="chart-marker">
                  {marker(s.marker, atX(p.x), atY(p.y, top))}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="chart-legend">
        {series.map((s, index) => (
          <li key={s.name} className={`chart-series-${String(index + 1)}`}>
            <span className="chart-swatch" aria-hidden="true">
              {MARKER_GLYPHS[s.marker ?? 'circle']}
            </span>
            {s.name}
            {s.axis === 'right' && rightLabel !== undefined ? ` (${rightLabel})` : ''}
            {(s.axis ?? 'left') === 'left' && left.length > 0 ? ` (${leftLabel})` : ''}
          </li>
        ))}
      </ul>
      {marks.length > 0 && (
        <ul className="chart-marks">
          {marks.map((mark) => (
            <li key={`${String(mark.x)}-${mark.label}`}>{`${formatX(mark.x)}: ${mark.label}`}</li>
          ))}
        </ul>
      )}
      {source !== undefined && <p className="chart-source">{source}</p>}
      <details className="chart-data">
        <summary>Show the numbers</summary>
        <DataTable caption={title} columns={columns} rows={rows} hideCaption />
      </details>
    </figure>
  );
}
