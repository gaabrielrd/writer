import { useSyncExternalStore } from 'react';
import { getBYOKConfig, subscribeBYOKConfig, getBYOKRevision } from '../services/byokStorage';

export function useAIConfig() {
  useSyncExternalStore(subscribeBYOKConfig, getBYOKRevision, getBYOKRevision);
  return getBYOKConfig();
}
