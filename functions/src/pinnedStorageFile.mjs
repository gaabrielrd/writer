/** Preserve decimal generation on the wire; the SDK constructor coerces it to Number. */
export function pinnedStorageFile(bucket, path, generation, metageneration = null) {
  const decimal = (v) => typeof v === 'string' && /^[0-9]+$/.test(v);
  if (!decimal(generation) || (metageneration !== null && !decimal(metageneration)))
    throw new TypeError('Identidade Storage inválida.');
  const file = bucket().file(path, {
    generation,
    preconditionOpts: {
      ifGenerationMatch: generation,
      ...(metageneration === null ? {} : { ifMetagenerationMatch: metageneration }),
    },
  });
  file.interceptors.push({
    request(options) {
      return { ...options, qs: { ...options.qs, generation } };
    },
  });
  return file;
}
