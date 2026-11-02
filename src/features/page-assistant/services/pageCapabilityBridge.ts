import type { PageCapability } from '../model/pageAssistant';

export interface PageCapabilitySnapshot {
  capabilities: PageCapability[];
  execute(id: string, value?: string): void;
}
const ids = new WeakMap<HTMLElement, string>();
let nextId = 0;
function visible(element: HTMLElement) {
  if (
    !element.isConnected ||
    element.closest('[data-page-assistant], [hidden], [inert], [aria-hidden="true"]')
  )
    return false;
  const style = getComputedStyle(element);
  return (
    style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0
  );
}
function enabled(element: HTMLElement) {
  return !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true';
}
function formSnapshot(element: HTMLElement): string {
  const scope =
    (element instanceof HTMLButtonElement ? element.form : null) ??
    element.closest('form, [role="dialog"], tr, li, article, section') ??
    element.parentElement;
  if (!scope) return '';
  return JSON.stringify(
    Array.from(
      scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      ),
    )
      .filter(
        (field) =>
          !field.closest('[data-page-assistant]') &&
          !(
            field instanceof HTMLInputElement && ['password', 'hidden', 'file'].includes(field.type)
          ),
      )
      .map((field) => [
        field.id,
        field.value,
        field instanceof HTMLInputElement ? field.checked : null,
      ]),
  );
}
function name(element: HTMLElement) {
  const labelled = element
    .getAttribute('aria-labelledby')
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
  const label = element.id
    ? Array.from(document.querySelectorAll('label')).find((item) => item.htmlFor === element.id)
        ?.textContent
    : '';
  return (element.getAttribute('aria-label') || labelled || label || element.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}
/** Closed capabilities from live controls; never accepts a model-provided selector or code. */
export function capturePageCapabilities(
  page: string,
  isCurrent: () => boolean,
): PageCapabilitySnapshot {
  const roots = Array.from(
    document.querySelectorAll('#main-content, [role="dialog"], [role="menu"], [role="listbox"]'),
  );
  const elements = new Set<HTMLElement>();
  for (const root of roots)
    for (const element of root.querySelectorAll<HTMLElement>(
      'button, a[href], input, textarea, select, [role="menuitem"], [role="option"], [role="tab"]',
    ))
      elements.add(element);
  const entries = new Map<
    string,
    { element: HTMLElement; capability: PageCapability; original?: string; form?: string }
  >();
  for (const element of elements) {
    if (entries.size === 80) break;
    if (!visible(element) || !enabled(element)) continue;
    const label = name(element);
    if (!label) continue;
    if (
      element instanceof HTMLAnchorElement &&
      (new URL(element.href).origin !== window.location.origin ||
        !['http:', 'https:'].includes(new URL(element.href).protocol))
    )
      continue;
    let kind: PageCapability['kind'] = 'action';
    let original: string | undefined;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
        if (!ids.has(element)) ids.set(element, `control-${++nextId}`);
        const id = ids.get(element)!;
        entries.set(id, {
          element,
          capability: { id, label, kind: 'action' },
          form: formSnapshot(element),
        });
        continue;
      }
      if (
        element.readOnly ||
        (element instanceof HTMLInputElement &&
          !['text', 'search', 'number', 'date', 'email', 'url', 'range'].includes(element.type))
      )
        continue;
      kind = 'field';
      original = element.value;
    } else if (element instanceof HTMLSelectElement) {
      kind = 'select';
      original = element.value;
    }
    let id = ids.get(element);
    if (!id) {
      id = `control-${++nextId}`;
      ids.set(element, id);
    }
    const capability: PageCapability = { id, label, kind };
    if (element instanceof HTMLSelectElement)
      capability.options = Array.from(element.options)
        .filter((o) => !o.disabled)
        .map((o) => o.label)
        .slice(0, 40);
    entries.set(id, {
      element,
      capability,
      original,
      ...(kind === 'action' ? { form: formSnapshot(element) } : {}),
    });
  }
  return {
    capabilities: Array.from(entries.values(), (entry) => entry.capability),
    execute(id, value) {
      const entry = entries.get(id);
      if (
        !entry ||
        !isCurrent() ||
        window.location.pathname !== page ||
        !visible(entry.element) ||
        !enabled(entry.element) ||
        name(entry.element) !== entry.capability.label
      )
        throw new Error('A página ou a ação mudou. Peça uma nova sugestão.');
      const element = entry.element;
      if (entry.capability.kind === 'action') {
        if (entry.form !== formSnapshot(element))
          throw new Error('O formulário mudou. Peça uma nova sugestão.');
        if (value !== undefined) throw new Error('Ação inválida.');
        element.click();
      } else if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        if (
          element.value !== entry.original ||
          element.readOnly ||
          typeof value !== 'string' ||
          (element.maxLength >= 0 && value.length > element.maxLength)
        )
          throw new Error('O campo mudou ou o texto excede seu limite. Revise antes de continuar.');
        if (element instanceof HTMLInputElement && element.type === 'range') {
          const numeric = Number(value),
            minimum = Number(element.min || 0),
            maximum = Number(element.max || 100),
            step = Number(element.step || 1);
          if (
            !value.trim() ||
            !Number.isFinite(numeric) ||
            numeric < minimum ||
            numeric > maximum ||
            (numeric - minimum) % step !== 0
          )
            throw new Error('O valor está fora dos limites do atributo.');
        }
        const prototype =
          element instanceof HTMLInputElement
            ? HTMLInputElement.prototype
            : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.focus();
      } else if (element instanceof HTMLSelectElement) {
        if (element.value !== entry.original || typeof value !== 'string')
          throw new Error('O campo mudou.');
        const option = Array.from(element.options).find((o) => o.label === value && !o.disabled);
        if (!option) throw new Error('Opção indisponível.');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
          element,
          option.value,
        );
        element.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        if (value !== undefined) throw new Error('Ação inválida.');
        element.click();
      }
    },
  };
}
