export interface BackupStorageFaults {
  write?: Error;
  close?: Error;
  remove?: Error;
  beforeWrite?: () => Promise<void>;
}
export class BackupFileHandle {
  bytes = new Uint8Array(0);
  aborted = 0;
  readonly faults: BackupStorageFaults;
  constructor(faults: BackupStorageFaults) {
    this.faults = faults;
  }
  getFile() {
    const snapshot = new Uint8Array(this.bytes);
    return Promise.resolve({
      size: snapshot.length,
      arrayBuffer: () => Promise.resolve(snapshot.buffer),
    });
  }
  createWritable() {
    let pending = new Uint8Array(0);
    return Promise.resolve({
      write: async (bytes: Uint8Array) => {
        await this.faults.beforeWrite?.();
        if (this.faults.write) throw this.faults.write;
        pending = new Uint8Array(bytes);
      },
      close: () => {
        if (this.faults.close) return Promise.reject(this.faults.close);
        this.bytes = pending;
        return Promise.resolve();
      },
      abort: () => {
        this.aborted++;
        return Promise.resolve();
      },
    });
  }
}
export class BackupDirectoryHandle {
  directories = new Map<string, BackupDirectoryHandle>();
  files = new Map<string, BackupFileHandle>();
  readonly faults: BackupStorageFaults;
  constructor(faults: BackupStorageFaults = {}) {
    this.faults = faults;
  }
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<BackupDirectoryHandle> {
    let directory = this.directories.get(name);
    if (!directory && options?.create) {
      directory = new BackupDirectoryHandle(this.faults);
      this.directories.set(name, directory);
    }
    return directory
      ? Promise.resolve(directory)
      : Promise.reject(new DOMException('missing', 'NotFoundError'));
  }
  getFileHandle(name: string, options?: { create?: boolean }): Promise<BackupFileHandle> {
    let file = this.files.get(name);
    if (!file && options?.create) {
      file = new BackupFileHandle(this.faults);
      this.files.set(name, file);
    }
    return file
      ? Promise.resolve(file)
      : Promise.reject(new DOMException('missing', 'NotFoundError'));
  }
  removeEntry(name: string) {
    if (this.faults.remove) return Promise.reject(this.faults.remove);
    this.directories.delete(name);
    this.files.delete(name);
    return Promise.resolve();
  }
}
