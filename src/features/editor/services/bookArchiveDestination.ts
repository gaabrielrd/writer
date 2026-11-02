import type { BookBackupSink } from '@/features/book-portability';
import { createBookBackupFileSink } from '@/features/book-portability';

export interface BookArchivePicker {
  supported(this: void): boolean;
  pick(this: void, fileName: string): Promise<Pick<FileSystemFileHandle, 'createWritable'>>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};
export const bookArchivePicker: BookArchivePicker = {
  supported: () =>
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof (window as PickerWindow).showSaveFilePicker === 'function',
  pick(fileName) {
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (!bookArchivePicker.supported() || !picker)
      throw new Error('Este navegador não oferece gravação de backup com seleção de arquivo.');
    return picker.call(window, {
      suggestedName: fileName,
      types: [
        {
          description: 'Backup privado do Writer',
          accept: { 'application/octet-stream': ['.writer'] },
        },
      ],
    });
  },
};
export const openBookArchiveSink = (
  handle: Pick<FileSystemFileHandle, 'createWritable'>,
): Promise<BookBackupSink> => createBookBackupFileSink(handle);
