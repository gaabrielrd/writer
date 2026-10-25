import { Readable } from 'node:stream';
const error = (code) => Object.assign(new Error('Storage ' + code), { code });
export function bookRestoreStorageBucket() {
  const current = new Map(),
    versions = new Map(),
    events = [];
  let generation = 9007199254741000n;
  const hooks = {};
  function version(path, gen) {
    const v = versions.get(path)?.get(gen ?? current.get(path));
    if (!v) throw error(404);
    return v;
  }
  function put(path, bytes, metadata) {
    const gen = String(++generation),
      v = {
        bytes: Buffer.from(bytes),
        metadata: {
          ...structuredClone(metadata),
          generation: gen,
          metageneration: '1',
          size: String(bytes.length),
        },
      };
    if (!versions.has(path)) versions.set(path, new Map());
    versions.get(path).set(gen, v);
    current.set(path, gen);
    return v;
  }
  const bucket = {
    name: 'demo-restore-memory',
    file(path, options = {}) {
      return {
        interceptors: [],
        async getMetadata() {
          events.push({ method: 'head', path, ...options });
          await hooks.head?.(path, options);
          return [structuredClone(version(path, options.generation).metadata)];
        },
        async save(bytes, options) {
          events.push({
            method: 'save',
            path,
            bytes: bytes.length,
            options: structuredClone(options),
          });
          await hooks.beforeSave?.(path, bytes, options);
          const prior = current.has(path) ? version(path) : null,
            p = options.preconditionOpts ?? {};
          if (
            p.ifGenerationMatch === 0
              ? prior !== null
              : String(p.ifGenerationMatch) !== prior?.metadata.generation
          )
            throw error(412);
          if (
            p.ifMetagenerationMatch !== undefined &&
            String(p.ifMetagenerationMatch) !== prior?.metadata.metageneration
          )
            throw error(412);
          const v = put(path, bytes, options.metadata);
          await hooks.afterSave?.(path, v, options);
          return [];
        },
        async setMetadata(metadata) {
          events.push({
            method: 'patch',
            path,
            metadata: structuredClone(metadata),
            options: structuredClone(options),
          });
          await hooks.beforePatch?.(path, metadata, options);
          const v = version(path, options.generation),
            p = options.preconditionOpts ?? {};
          if (
            (p.ifGenerationMatch !== undefined &&
              String(p.ifGenerationMatch) !== v.metadata.generation) ||
            (p.ifMetagenerationMatch !== undefined &&
              String(p.ifMetagenerationMatch) !== v.metadata.metageneration)
          )
            throw error(412);
          v.metadata = {
            ...v.metadata,
            ...structuredClone(metadata),
            metadata: { ...v.metadata.metadata, ...metadata.metadata },
            metageneration: String(BigInt(v.metadata.metageneration) + 1n),
          };
          await hooks.afterPatch?.(path, v, options);
          return [structuredClone(v.metadata)];
        },
        createReadStream(options) {
          events.push({
            method: 'read',
            path,
            ...options,
            generation: this.generation ?? undefined,
          });
          const v = version(path, this.generation ?? undefined);
          return Readable.from([Buffer.from(v.bytes)]);
        },
        async delete(args) {
          events.push({ method: 'delete', path, options: structuredClone(options), args });
          let v;
          try {
            v = version(path, options.generation);
          } catch (e) {
            if (e.code === 404 && args.ignoreNotFound) return [];
            throw e;
          }
          if (
            options.preconditionOpts?.ifGenerationMatch !== undefined &&
            String(options.preconditionOpts.ifGenerationMatch) !== v.metadata.generation
          )
            throw error(412);
          versions.get(path).delete(v.metadata.generation);
          if (current.get(path) === v.metadata.generation) current.delete(path);
          return [];
        },
        generation: options.generation,
      };
    },
  };
  return {
    bucket: () => bucket,
    current,
    versions,
    events,
    hooks,
    put,
    version,
    mutate(path, change) {
      const v = version(path);
      change(v.metadata);
      v.metadata.metageneration = String(BigInt(v.metadata.metageneration) + 1n);
    },
  };
}
