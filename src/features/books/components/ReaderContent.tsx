import { createElement, useMemo, type ReactNode } from 'react';
import { renderRichText } from '@/shared/lib';
import type { PublicLoreEntity } from '../services/publicBookService';
import { ReaderLoreTooltip } from './ReaderLoreTooltip';

function highlightText(
  text: string,
  lore: PublicLoreEntity[],
  allLore: PublicLoreEntity[],
  key: string,
): ReactNode {
  const ownership = new Map<string, Set<string>>();
  for (const entity of allLore)
    for (const name of [entity.name, ...entity.aliases]) {
      const key = name.trim().toLocaleLowerCase();
      if (!ownership.has(key)) ownership.set(key, new Set());
      ownership.get(key)!.add(entity.id);
    }
  const terms = lore
    .filter((entity) => entity.isPublic === true)
    .flatMap((entity) =>
      [entity.name, ...entity.aliases]
        .filter((term) => term.trim())
        .map((term) => ({ term: term.trim(), entity })),
    )
    .filter(
      ({ term, entity }) =>
        !entity.readerGuide || (ownership.get(term.toLocaleLowerCase())?.size ?? 0) <= 1,
    )
    .sort((a, b) => b.term.length - a.term.length);
  if (!terms.length) return text;
  const names = terms.map(({ term }) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${names.join('|')})(?![\\p{L}\\p{N}_])`,
    'giu',
  );
  const children: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const entity = terms.find(
      ({ term }) => term.toLocaleLowerCase() === match[0].toLocaleLowerCase(),
    )?.entity;
    children.push(text.slice(cursor, match.index));
    if (entity)
      children.push(
        <ReaderLoreTooltip key={`${key}-${match.index}`} entity={entity}>
          {match[0]}
        </ReaderLoreTooltip>,
      );
    else children.push(match[0]);
    cursor = match.index + match[0].length;
  }
  children.push(text.slice(cursor));
  return children;
}

export function ReaderContent({
  content,
  lore,
  allLore = lore,
}: {
  content: string;
  lore: PublicLoreEntity[];
  allLore?: PublicLoreEntity[];
}) {
  const children = useMemo(() => {
    const template = document.createElement('template');
    template.innerHTML = renderRichText(content);
    if (!template.content.textContent?.trim()) return <p>Este capítulo ainda não contém texto.</p>;
    function renderNode(node: Node, key: string, interactive = false): ReactNode {
      if (node.nodeType === Node.TEXT_NODE)
        return interactive
          ? node.textContent
          : highlightText(node.textContent ?? '', lore, allLore, key);
      if (!(node instanceof Element)) return null;
      const tag = node.tagName.toLowerCase();
      const props =
        tag === 'a'
          ? { key, href: node.getAttribute('href') ?? undefined, rel: 'noopener noreferrer' }
          : { key };
      const content = Array.from(node.childNodes).map((child, index) =>
        renderNode(
          child,
          `${key}-${index}`,
          interactive || tag === 'a' || tag === 'code' || tag === 'pre',
        ),
      );
      return createElement(tag, props, ...content);
    }
    return Array.from(template.content.childNodes).map((node, index) =>
      renderNode(node, String(index)),
    );
  }, [content, lore, allLore]);
  return <>{children}</>;
}
