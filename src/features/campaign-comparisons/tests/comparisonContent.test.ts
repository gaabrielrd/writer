import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as transport from '../services/campaignComparisonCallables';
import {
  readCompleteComparisonItem,
  validateChange,
  validateImage,
  validateProgress,
} from '../services/campaignComparisonService';
import type { ComparisonItemWindow } from '../model/campaignComparison';
import {
  envelope,
  identity,
  sceneKey,
  sceneSummary,
  progress,
  uid,
  token,
  deferred,
  installBrowser,
  sha,
} from './fixtures';
vi.mock('../services/campaignComparisonCallables', () => ({ readCampaignComparisonItem: vi.fn() }));
beforeEach(() => {
  vi.resetAllMocks();
  installBrowser();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function windowPair(): Promise<[ComparisonItemWindow, ComparisonItemWindow]> {
  const prefix = '<p>' + 'x'.repeat(65525) + '🐉\n',
    suffix = 'continuação</p>',
    content = prefix + suffix;
  const item = {
    sourceKey: sceneKey,
    kind: 'scene' as const,
    parentKey: null,
    title: 'Cena imutável',
    archived: false,
    orderKey: '001',
    fields: [
      {
        field: 'content',
        sha256: await sha(content),
        bytes: new TextEncoder().encode(content).byteLength,
        chunkCount: 2,
      },
    ],
    structured: {},
    image: null,
  };
  return [
    {
      ...envelope,
      side: 'current',
      key: sceneKey,
      item,
      chunks: [{ field: 'content', index: 0, content: prefix }],
      nextCursor: 'window-2',
    },
    {
      ...envelope,
      side: 'current',
      key: sceneKey,
      item,
      chunks: [{ field: 'content', index: 1, content: suffix }],
      nextCursor: null,
    },
  ];
}
it('só publica texto Unicode integral depois da última janela autorizada e manifesto verificado', async () => {
  const [first, last] = await windowPair(),
    gate = deferred<ComparisonItemWindow>();
  vi.mocked(transport.readCampaignComparisonItem)
    .mockResolvedValueOnce(first)
    .mockReturnValueOnce(gate.promise);
  let done = false;
  const reading = readCompleteComparisonItem(
    identity,
    'current',
    sceneKey,
    token,
    0,
    () => true,
  ).then((value) => {
    done = true;
    return value;
  });
  await vi.waitFor(() => expect(transport.readCampaignComparisonItem).toHaveBeenCalledTimes(2));
  expect(done).toBe(false);
  gate.resolve(last);
  expect((await reading)?.fields.content).toBe('<p>' + 'x'.repeat(65525) + '🐉\ncontinuação</p>');
  expect(transport.readCampaignComparisonItem).toHaveBeenLastCalledWith({
    comparisonId: identity.comparisonId,
    sourceKey: sceneKey,
    side: 'current',
    cursor: 'window-2',
    limit: 4,
  });
});
it.each([
  'side',
  'key',
  'owner',
  'generation',
  'token',
  'collectionRevision',
  'currentCapturedAt',
  'candidateCapturedAt',
  'null',
  'metadata',
  'hash',
  'order',
  'cursor',
] as const)('não compõe corpo quando a segunda janela muda %s', async (which) => {
  const [first, original] = await windowPair();
  const last = structuredClone(original);
  if (which === 'side') last.side = 'candidate';
  if (which === 'key') last.key = '9'.repeat(64);
  if (which === 'owner') last.ownerId = 'another';
  if (which === 'generation') last.candidateBaseId = '9'.repeat(64);
  if (which === 'token') last.comparisonToken = '9'.repeat(64);
  if (which === 'collectionRevision') last.collectionRevision++;
  if (which === 'currentCapturedAt') last.currentCapturedAt++;
  if (which === 'candidateCapturedAt') last.candidateCapturedAt++;
  if (which === 'null') last.item = null;
  if (which === 'metadata') last.item!.title = 'Título alterado';
  if (which === 'hash') last.chunks[0]!.content = 'Texto adulterado';
  if (which === 'order') last.chunks[0]!.index = 0;
  if (which === 'cursor') last.nextCursor = 'window-2';
  vi.mocked(transport.readCampaignComparisonItem)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(last);
  await expect(
    readCompleteComparisonItem(identity, 'current', sceneKey, token, 0, () => true),
  ).rejects.toThrow();
});
it('cancelamento na troca de seleção ou UID após await não publica texto nem pede outra página', async () => {
  const [first] = await windowPair(),
    gate = deferred<ComparisonItemWindow>();
  let current = true;
  vi.mocked(transport.readCampaignComparisonItem).mockReturnValueOnce(gate.promise);
  const reading = readCompleteComparisonItem(
    identity,
    'current',
    sceneKey,
    token,
    0,
    () => current,
  );
  current = false;
  gate.resolve(first);
  expect(await reading).toBeNull();
  expect(transport.readCampaignComparisonItem).toHaveBeenCalledOnce();
});
it('respostas e mídias acima do orçamento não são aceitas como recursos válidos', async () => {
  const [first] = await windowPair();
  vi.mocked(transport.readCampaignComparisonItem).mockResolvedValue({
    ...first,
    chunks: [{ field: 'content', index: 0, content: 'x'.repeat(4 * 1024 * 1024 + 1) }],
  });
  await expect(
    readCompleteComparisonItem(identity, 'current', sceneKey, token, 0, () => true),
  ).rejects.toThrow(/orçamento/);
  expect(() => validateImage('https://example.com/private-token')).toThrow();
  expect(() => validateImage('data:image/svg+xml;base64,PHN2Zz4=')).toThrow();
  expect(() => validateImage('data:image/webp;base64,' + 'AAAA'.repeat(524289))).toThrow();
});
it('projeção indisponível não aceita contagens antigas nem usa ordem de item ausente como mudança autoral', () => {
  expect(() => validateProgress({ ...progress, sourceAvailable: false }, uid, identity)).toThrow();
  validateProgress(
    { ...progress, sourceAvailable: false, processed: null, counts: null },
    uid,
    identity,
  );
  expect(() =>
    validateChange(
      {
        group: 'items',
        key: sceneKey,
        change: 'added',
        currentSummary: null,
        candidateSummary: sceneSummary,
        orderContextChanged: true,
      },
      'items',
    ),
  ).toThrow();
});
