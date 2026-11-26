/* eslint-disable react-refresh/only-export-components */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

/** Light, dependency-free SVG charts for the dashboard. */

/** Width of an element, kept up to date when it is resized */
export const useElementWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setWidth(ref.current.getBoundingClientRect().width);
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

/** Circular progress, `value` between 0 and 1, with content in the middle */
export const Ring = ({
  value,
  size = 84,
  thickness = 8,
  color = "var(--brand)",
  className,
  children,
  label,
}: {
  value: number;
  size?: number;
  thickness?: number;
  color?: string;
  className?: string;
  children?: ReactNode;
  label?: string;
}) => {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(value, 0), 1);
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-foreground/[0.07]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{ transition: "stroke-dashoffset 900ms ease-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">
        {children}
      </div>
    </div>
  );
};

export type DonutSegment = { label: string; value: number; color: string };

/** Donut chart; hovering a segment highlights it */
export const Donut = ({
  segments,
  size = 200,
  thickness = 26,
  active,
  onActiveChange,
  children,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  active?: number | null;
  onActiveChange?: (index: number | null) => void;
  children?: ReactNode;
}) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const radius = (size - thickness) / 2;
  const center = size / 2;
  const gap = segments.length > 1 ? 0.012 : 0;
  let start = 0;
  const arcs = segments.map((segment, index) => {
    const fraction = total > 0 ? segment.value / total : 0;
    const from = start + gap / 2;
    const to = start + fraction - gap / 2;
    start += fraction;
    return { segment, index, from, to: Math.max(to, from) };
  });
  const point = (fraction: number, r: number) => {
    const angle = fraction * 2 * Math.PI - Math.PI / 2;
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)];
  };
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label="Pipeline by stage">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={thickness}
          className="text-foreground/[0.06]"
        />
        {arcs.map(({ segment, index, from, to }) => {
          if (to - from <= 0) return null;
          const highlighted = active === index;
          const r = radius;
          if (to - from >= 0.999) {
            return (
              <circle
                key={index}
                cx={center}
                cy={center}
                r={r}
                fill="none"
                stroke={segment.color}
                strokeWidth={highlighted ? thickness + 6 : thickness}
                onMouseEnter={() => onActiveChange?.(index)}
                onMouseLeave={() => onActiveChange?.(null)}
              />
            );
          }
          const [x1, y1] = point(from, r);
          const [x2, y2] = point(to, r);
          const large = to - from > 0.5 ? 1 : 0;
          return (
            <path
              key={index}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
              fill="none"
              stroke={segment.color}
              strokeWidth={highlighted ? thickness + 6 : thickness}
              strokeLinecap="butt"
              style={{ transition: "stroke-width 150ms ease-out" }}
              onMouseEnter={() => onActiveChange?.(index)}
              onMouseLeave={() => onActiveChange?.(null)}
            >
              <title>{segment.label}</title>
            </path>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
};

/** Monotone cubic interpolation (no overshoot below zero), as an SVG path */
const monotonePath = (points: [number, number][]) => {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M ${points[0][0]} ${points[0][1]}`;
  const dx: number[] = [];
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0]);
    slopes.push((points[i + 1][1] - points[i][1]) / dx[i]);
  }
  const tangents = [slopes[0]];
  for (let i = 1; i < n - 1; i++) {
    tangents.push(
      slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2,
    );
  }
  tangents.push(slopes[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangents[i] = t * a * slopes[i];
      tangents[i + 1] = t * b * slopes[i];
    }
  }
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = dx[i] / 3;
    d += ` C ${x0 + h} ${y0 + tangents[i] * h}, ${x1 - h} ${y1 - tangents[i + 1] * h}, ${x1} ${y1}`;
  }
  return d;
};

const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(
    (candidate) => candidate >= normalized,
  )!;
  return step * magnitude;
};

export type ComboPoint = { label: string; bar: number; line: number };

/** Monthly bars with a smooth line on top (Revenue analytics) */
export const ComboChart = ({
  data,
  height = 260,
  formatValue,
  formatTick,
  barLabel,
  lineLabel,
}: {
  data: ComboPoint[];
  height?: number;
  formatValue: (value: number) => string;
  formatTick: (value: number) => string;
  barLabel: string;
  lineLabel: string;
}) => {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padding = { top: 16, right: 12, bottom: 28, left: 52 };
  const innerWidth = Math.max(width - padding.left - padding.right, 0);
  const innerHeight = height - padding.top - padding.bottom;
  const max = niceMax(
    Math.max(...data.map((point) => Math.max(point.bar, point.line)), 0),
  );
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);
  const band = data.length ? innerWidth / data.length : 0;
  const barWidth = Math.min(Math.max(band * 0.42, 6), 26);
  const x = (index: number) => padding.left + band * index + band / 2;
  const y = (value: number) => padding.top + innerHeight * (1 - value / max);
  const line = monotonePath(data.map((point, index) => [x(index), y(point.line)]));
  const onMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const box = event.currentTarget.getBoundingClientRect();
      const index = Math.floor((event.clientX - box.left) / band);
      setHover(index >= 0 && index < data.length ? index : null);
    },
    [band, data.length],
  );
  const hovered = hover != null ? data[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} className="overflow-visible">
          <defs>
            <linearGradient id="hdh-bar" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--brand)" stopOpacity="1" />
              <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id="hdh-line-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padding.left}
                x2={padding.left + innerWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke="currentColor"
                strokeDasharray={tick === 0 ? undefined : "3 5"}
                className="text-foreground/[0.09]"
              />
              <text
                x={padding.left - 10}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {formatTick(tick)}
              </text>
            </g>
          ))}
          {data.map((point, index) => {
            const top = y(point.bar);
            const barHeight = padding.top + innerHeight - top;
            return (
              <g key={point.label + index}>
                {hover === index ? (
                  <rect
                    x={x(index) - band / 2 + 2}
                    y={padding.top}
                    width={band - 4}
                    height={innerHeight}
                    rx={8}
                    className="fill-foreground/[0.04]"
                  />
                ) : null}
                {point.bar > 0 ? (
                  <rect
                    x={x(index) - barWidth / 2}
                    y={top}
                    width={barWidth}
                    height={Math.max(barHeight, 2)}
                    rx={Math.min(barWidth / 2, 6)}
                    fill="url(#hdh-bar)"
                  />
                ) : null}
                <text
                  x={x(index)}
                  y={height - 8}
                  textAnchor="middle"
                  className={cn(
                    "text-[11px]",
                    hover === index ? "fill-foreground" : "fill-muted-foreground",
                  )}
                >
                  {point.label}
                </text>
              </g>
            );
          })}
          {data.length > 1 ? (
            <>
              <path
                d={`${line} L ${x(data.length - 1)} ${padding.top + innerHeight} L ${x(0)} ${padding.top + innerHeight} Z`}
                fill="url(#hdh-line-fill)"
              />
              <path
                d={line}
                fill="none"
                stroke="var(--foreground)"
                strokeOpacity={0.78}
                strokeWidth={2.25}
                strokeLinecap="round"
              />
            </>
          ) : null}
          {data.map((point, index) =>
            hover === index || index === data.length - 1 ? (
              <circle
                key={`dot-${index}`}
                cx={x(index)}
                cy={y(point.line)}
                r={4}
                fill="var(--background)"
                stroke="var(--foreground)"
                strokeWidth={2}
              />
            ) : null,
          )}
          <rect
            x={padding.left}
            y={padding.top}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
      ) : null}
      {hovered && hover != null ? (
        <div
          className="glass-card pointer-events-none absolute z-10 min-w-40 rounded-xl px-3 py-2 text-xs"
          style={{
            left: Math.min(Math.max(x(hover) - 80, 0), Math.max(width - 170, 0)),
            top: 0,
          }}
        >
          <p className="mb-1 font-semibold">{hovered.label}</p>
          <p className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-sm bg-brand" />
              {barLabel}
            </span>
            <span className="font-medium">{formatValue(hovered.bar)}</span>
          </p>
          <p className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-0.5 w-3 rounded bg-foreground/80" />
              {lineLabel}
            </span>
            <span className="font-medium">{formatValue(hovered.line)}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
};
