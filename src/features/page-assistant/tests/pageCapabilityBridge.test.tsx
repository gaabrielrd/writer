import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { capturePageCapabilities } from '../services/pageCapabilityBridge';
function Form() {
  const [title, setTitle] = useState('original');
  const [saved, setSaved] = useState('');
  return (
    <main id="main-content">
      <label htmlFor="title">Título</label>
      <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={50} />
      <button onClick={() => setSaved(title)}>Salvar projeto</button>
      <output>{saved}</output>
      <input aria-label="Segredo" type="password" />
      <button disabled>Indisponível</button>
      <div hidden>
        <button>Oculto</button>
      </div>
      <a href="https://external.test">Externo</a>
    </main>
  );
}
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => {
  vi.restoreAllMocks();
});
it('fills controlled React fields only on execution and calls the existing save handler', () => {
  render(<Form />);
  const snapshot = capturePageCapabilities(window.location.pathname, () => true);
  const field = snapshot.capabilities.find((c) => c.label === 'Título')!;
  expect(screen.getByLabelText('Título')).toHaveValue('original');
  act(() => snapshot.execute(field.id, 'nova história'));
  expect(screen.getByLabelText('Título')).toHaveValue('nova história');
  const refreshed = capturePageCapabilities(window.location.pathname, () => true);
  act(() =>
    refreshed.execute(refreshed.capabilities.find((c) => c.label === 'Salvar projeto')!.id),
  );
  expect(screen.getByRole('status')).toHaveTextContent('nova história');
});
it('omits secrets, hidden/disabled controls, external links and the assistant itself', () => {
  render(
    <>
      <Form />
      <div data-page-assistant>
        <main id="other">
          <button>Autocomando</button>
        </main>
      </div>
    </>,
  );
  const labels = capturePageCapabilities(window.location.pathname, () => true).capabilities.map(
    (c) => c.label,
  );
  expect(labels).toEqual(['Título', 'Salvar projeto']);
});
it('refuses changed fields, obsolete actor/page snapshots, oversized text and unknown controls', () => {
  render(<Form />);
  const snapshot = capturePageCapabilities(window.location.pathname, () => true);
  const field = snapshot.capabilities.find((c) => c.label === 'Título')!;
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'escrita manual' } });
  expect(() => snapshot.execute(field.id, 'sobrescrever')).toThrow('campo mudou');
  const stale = capturePageCapabilities(window.location.pathname, () => false);
  expect(() => stale.execute(stale.capabilities[0]!.id, 'outro')).toThrow('página');
  const current = capturePageCapabilities(window.location.pathname, () => true);
  expect(() => current.execute(current.capabilities[0]!.id, 'a'.repeat(51))).toThrow('limite');
  expect(() => current.execute('forged')).toThrow('página');
  expect(screen.getByLabelText('Título')).toHaveValue('escrita manual');
});

it('does not submit fields that changed after the action preview was captured', () => {
  render(<Form />);
  const snapshot = capturePageCapabilities(window.location.pathname, () => true);
  const save = snapshot.capabilities.find((c) => c.label === 'Salvar projeto')!;
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'edição posterior' } });
  expect(() => snapshot.execute(save.id)).toThrow('formulário mudou');
  expect(screen.getByRole('status')).toHaveTextContent('');
});
