import type { CampaignBaseChunk, CampaignBaseManifest } from '../model/campaignBase';
export async function campaignFieldHash(content: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}
export async function verifyCampaignBaseFields(
  manifests: CampaignBaseManifest[],
  chunks: CampaignBaseChunk[],
  isCurrent: () => boolean,
): Promise<Record<string, string>> {
  const indexes = new Map<string, number>(),
    texts = new Map<string, string[]>();
  let bytes = 0;
  for (const manifest of manifests) {
    if (
      !manifest ||
      typeof manifest.field !== 'string' ||
      !manifest.field ||
      texts.has(manifest.field) ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes < 0 ||
      !Number.isSafeInteger(manifest.chunkCount) ||
      manifest.chunkCount < 1 ||
      manifest.chunkCount > Math.max(1, Math.ceil(manifest.bytes / (65536 - 3)))
    )
      throw new Error('O manifesto do conteúdo capturado não pôde ser confirmado.');
    bytes += manifest.bytes;
    indexes.set(manifest.field, 0);
    texts.set(manifest.field, []);
  }
  if (bytes > 2 * 1024 * 1024)
    throw new Error('O conteúdo capturado excede o orçamento de leitura deste recurso.');
  for (const chunk of chunks) {
    if (
      !chunk ||
      !indexes.has(chunk.field) ||
      chunk.index !== indexes.get(chunk.field) ||
      typeof chunk.content !== 'string' ||
      new TextEncoder().encode(chunk.content).byteLength > 65536
    )
      throw new Error('Os trechos capturados estão incompletos ou fora de ordem.');
    texts.get(chunk.field)!.push(chunk.content);
    indexes.set(chunk.field, chunk.index + 1);
  }
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const manifest of manifests) {
    if (!isCurrent()) throw new Error('Leitura cancelada.');
    const content = texts.get(manifest.field)!.join('');
    if (
      indexes.get(manifest.field) !== manifest.chunkCount ||
      new TextEncoder().encode(content).byteLength !== manifest.bytes
    )
      throw new Error('O conteúdo capturado não pôde ser remontado integralmente.');
    const hash = await campaignFieldHash(content);
    if (!isCurrent()) throw new Error('Leitura cancelada.');
    if (hash !== manifest.sha256)
      throw new Error('O texto capturado não corresponde à versão confirmada.');
    result[manifest.field] = content;
  }
  return result;
}
