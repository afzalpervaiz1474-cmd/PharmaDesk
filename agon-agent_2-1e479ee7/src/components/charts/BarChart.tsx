export interface BarDatum {
  label: string;
  value: number;
  /** Extra context announced with the bar, e.g. "3 batches". */
  detail?: string;
}

/** Rounds a maximum up to a tidy axis value (1, 2, 5 × 10ⁿ). */
function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return step * magnitude;
}

interface BarChartProps {
  data: BarDatum[];
  /** Describes the chart for screen readers. */
  label: string;
  unit: string;
}

/**
 * Vertical bar chart built from plain HTML so labels stay crisp and readable
 * at any width. The same data is exposed as a list for assistive technology.
 */
export function BarChart({ data, label, unit }: BarChartProps) {
  const top = niceCeiling(Math.max(...data.map((datum) => datum.value), 0));
  const ticks = [top, top / 2, 0];

  return (
    <figure aria-label={label}>
      <div className="flex gap-3">
        <div className="tabular flex h-48 flex-col justify-between pb-0 text-right text-[11px] text-muted" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {tick.toLocaleString()}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48 border-b border-line-strong">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden="true" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" aria-hidden="true" />
            <ul className="absolute inset-0 flex items-end gap-2 sm:gap-4">
              {data.map((datum) => (
                <li key={datum.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <span className="sr-only">
                    {datum.label}: {datum.value.toLocaleString()} {unit}
                    {datum.detail ? `, ${datum.detail}` : ''}
                  </span>
                  <span className="tabular mb-1 text-[11px] font-medium text-ink-soft" aria-hidden="true">
                    {datum.value > 0 ? datum.value.toLocaleString() : ''}
                  </span>
                  <div
                    aria-hidden="true"
                    title={datum.detail}
                    className="w-full max-w-14 rounded-t bg-primary"
                    style={{ height: `${(datum.value / top) * 100}%`, minHeight: datum.value > 0 ? 2 : 0 }}
                  />
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-2 flex gap-2 sm:gap-4" aria-hidden="true">
            {data.map((datum) => (
              <span key={datum.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted">
                {datum.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}
