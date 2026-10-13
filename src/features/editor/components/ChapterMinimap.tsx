import { useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Tooltip } from '@/shared/ui';
import type { LoreCategory } from '@/features/lore';
import type { MeasuredMinimapDestination } from '../hooks/useChapterMinimap';
import { clampMinimap } from '../model/chapterMinimap';
import styles from './ChapterMinimap.module.css';

interface ChapterMinimapProps {
  destinations: MeasuredMinimapDestination[];
  viewport: { start: number; end: number };
  onNavigate: (ratio: number, position?: number) => void;
}

const categories: LoreCategory[] = ['character', 'location', 'concept', 'other'];
const instructions = 'Setas escolhem um trecho; Home/End vão ao primeiro/último; Enter navega.';

export function ChapterMinimap({ destinations, viewport, onNavigate }: ChapterMinimapProps) {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState(500);
  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setMapHeight(Math.max(1, entry.contentRect.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const activeIndex = Math.min(selected, Math.max(0, destinations.length - 1));
  const active = destinations[activeIndex];
  const tooltip = destinations[hovered ?? activeIndex]?.label ?? 'Capítulo vazio';
  const paths = useMemo(() => {
    const lines = new Set<string>();
    const headings: string[] = [];
    // Reserve one pixel between the two-pixel marker outlines.
    const markerRows = Math.max(1, Math.floor(mapHeight / 3));
    const occupiedRows = new Map<number, Set<LoreCategory>>();
    const markers = Object.fromEntries(
      categories.map((category) => [category, new Set<string>()]),
    ) as Record<LoreCategory, Set<string>>;
    for (const entry of destinations) {
      const y = Math.round(entry.start * 500);
      if (entry.kind === 'entity' && entry.category) {
        const row = Math.min(markerRows - 1, Math.floor(entry.start * markerRows));
        const occupied = occupiedRows.get(row) ?? new Set<LoreCategory>();
        occupied.add(entry.category);
        occupiedRows.set(row, occupied);
      } else if (entry.kind === 'heading') {
        headings.push(`M8 ${y}h${Math.max(32, 68 - entry.level * 6)}`);
      } else {
        const end = Math.min(500, Math.round(entry.end * 500));
        for (let line = y; line <= Math.max(y, end - 2); line += 3) {
          lines.add(`M8 ${line}h${line + 3 >= end ? 24 + Math.min(38, entry.length / 3) : 62}`);
        }
      }
    }
    for (const [row, occupied] of occupiedRows) {
      const present = categories.filter((category) => occupied.has(category));
      const width = 12 / present.length;
      present.forEach((category, index) => {
        markers[category].add(
          `M${80 + index * width} ${((row + 0.5) / markerRows) * 500}h${width}`,
        );
      });
    }
    return { lines: [...lines].join(''), headings: headings.join(''), markers };
  }, [destinations, mapHeight]);

  const targetAtPointer = (
    event: Pick<MouseEvent<HTMLDivElement>, 'currentTarget' | 'clientX' | 'clientY'>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = clampMinimap((event.clientY - bounds.top) / Math.max(1, bounds.height));
    const isEntity = (event.clientX - bounds.left) / bounds.width > 0.75;
    let index = -1;
    let distance = Infinity;
    destinations.forEach((entry, candidate) => {
      if ((entry.kind === 'entity') !== isEntity) return;
      const difference = Math.abs(entry.start - ratio);
      if (difference < distance) {
        index = candidate;
        distance = difference;
      }
    });
    return { ratio, index: distance * bounds.height <= 8 ? index : -1 };
  };

  return (
    <nav className={styles.rail} aria-label="Minimapa do capítulo">
      <span id={`${id}-help`} className="sr-only">
        {instructions}
      </span>
      <Tooltip content={tooltip}>
        <div
          ref={mapRef}
          className={styles.map}
          role="listbox"
          data-editor-minimap-list
          aria-label="Trechos do capítulo"
          aria-describedby={`${id}-help`}
          aria-activedescendant={active ? `${id}-option-${activeIndex}` : undefined}
          aria-disabled={!active}
          tabIndex={0}
          onPointerDown={(event) => {
            // Mouse navigation preserves the manuscript's native selection and focus.
            if (event.pointerType === 'mouse') event.preventDefault();
          }}
          onClick={(event) => {
            if (!active) return;
            const { ratio, index } = targetAtPointer(event);
            if (index >= 0) setSelected(index);
            onNavigate(ratio, index >= 0 ? destinations[index]?.position : undefined);
          }}
          onPointerMove={(event) => {
            const { index } = targetAtPointer(event);
            setHovered(index >= 0 ? index : null);
          }}
          onPointerLeave={() => setHovered(null)}
          onKeyDown={(event) => {
            if (!active) return;
            const last = destinations.length - 1;
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? last
                  : event.key === 'ArrowDown'
                    ? Math.min(last, activeIndex + 1)
                    : event.key === 'ArrowUp'
                      ? Math.max(0, activeIndex - 1)
                      : null;
            if (next !== null) {
              event.preventDefault();
              setHovered(null);
              setSelected(next);
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              onNavigate(active.start, active.position);
            }
          }}
        >
          {active ? (
            <>
              <svg
                viewBox="0 0 100 500"
                preserveAspectRatio="none"
                aria-hidden="true"
                className={styles.drawing}
              >
                <path d={paths.lines} className={styles.paragraphs} />
                <path d={paths.headings} className={styles.headings} />
                {categories.map((category) => (
                  <g key={category}>
                    <path
                      d={[...paths.markers[category]].join('')}
                      className={styles.markerOutline}
                    />
                    <path
                      d={[...paths.markers[category]].join('')}
                      className={styles[category]}
                      data-minimap-category={category}
                    />
                  </g>
                ))}
              </svg>
              <span
                className={styles.viewport}
                data-minimap-viewport
                aria-hidden="true"
                style={{
                  top: `${viewport.start * 100}%`,
                  height: `${(viewport.end - viewport.start) * 100}%`,
                }}
              />
              <span
                className={styles.keyboardMarker}
                aria-hidden="true"
                style={{ top: `${Math.min(active.start, 0.995) * 100}%` }}
              />
              <span
                id={`${id}-option-${activeIndex}`}
                key={activeIndex}
                role="option"
                aria-selected="true"
                aria-posinset={activeIndex + 1}
                aria-setsize={destinations.length}
                className="sr-only"
              >
                {active.label}
              </span>
            </>
          ) : (
            <span className={styles.empty}>Capítulo vazio</span>
          )}
        </div>
      </Tooltip>
    </nav>
  );
}
