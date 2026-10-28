export interface AdventureArchiveSink {
  write(this: void, bytes: Uint8Array): Promise<void>;
  close(this: void): Promise<void>;
  abort(this: void, reason: unknown): Promise<void>;
}
export interface AdventureArchivePicker {
  supported(this: void): boolean;
  pick(this: void, name: string): Promise<Pick<FileSystemFileHandle, 'createWritable'>>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};
export const adventureArchivePicker: AdventureArchivePicker = {
  supported: () =>
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof (window as PickerWindow).showSaveFilePicker === 'function',
  pick(name) {
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (!adventureArchivePicker.supported() || !picker)
      throw Error('Este navegador não oferece gravação de backup com seleção de arquivo.');
    return picker.call(window, {
      suggestedName: name,
      types: [
        {
          description: 'Backup privado de aventura do Writer',
          accept: { 'application/octet-stream': ['.writer'] },
        },
      ],
    });
  },
};
export async function openAdventureArchiveSink(
  handle: Pick<FileSystemFileHandle, 'createWritable'>,
): Promise<AdventureArchiveSink> {
  const file = await handle.createWritable({ keepExistingData: false });
  let state: 'open' | 'closing' | 'closed' | 'failed' | 'aborted' = 'open';
  return {
    async write(bytes) {
      if (state !== 'open') throw Error('Arquivo de backup não está aberto.');
      await file.write(new Uint8Array(bytes));
    },
    async close() {
      if (state !== 'open') throw Error('Arquivo de backup não está aberto.');
      state = 'closing';
      try {
        await file.close();
        state = 'closed';
      } catch (error) {
        state = 'failed';
        throw error;
      }
    },
    async abort(reason) {
      if (state === 'closed' || state === 'aborted') return;
      state = 'aborted';
      await file.abort(reason);
    },
  };
}
