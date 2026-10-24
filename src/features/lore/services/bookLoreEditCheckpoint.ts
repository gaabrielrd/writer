import type { BookLoreEditPhase } from './bookLoreEditOperation';
import type {
  LoreInspectionProgress,
  LoreEditProgress,
  LoreCleanupBlock,
} from './bookLoreWriteProgress';
import type { LoreJournalWire } from './bookLoreJournalContracts';
/** Contains private RPC bytes. Never persist this value without encryption. */
export interface BookLoreEditCheckpoint {
  readonly schemaVersion: 1;
  readonly uid: string;
  readonly writeId: string;
  readonly bookId: string;
  readonly loreId: string;
  readonly sourceToken: string;
  readonly intentHash: string;
  readonly phase: BookLoreEditPhase;
  readonly completedCalls: number;
  readonly blockedReason: LoreCleanupBlock | null;
  readonly cancelRequested: boolean;
  readonly initialized: boolean;
  readonly reservationIndex: number;
  readonly productionUploadIndex: number;
  readonly cleanupUploadIndex: number;
  readonly uploadCount: number;
  readonly hasEditIntent: boolean;
  readonly controlsHash: string;
  readonly inspection: LoreInspectionProgress | null;
  readonly edit: LoreEditProgress | null;
  readonly pending: {
    readonly production: LoreJournalWire | null;
    readonly cleanup: LoreJournalWire | null;
    readonly failedCancel: LoreJournalWire | null;
  };
}
export interface BookLoreEditRecovery {
  readonly checkpoint: unknown;
  readonly controlsPage: (this: void, offset: number, limit: number) => Promise<unknown>;
}
