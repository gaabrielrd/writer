import { createContext, useContext } from 'react';
import type { ProfileInput, WriterProfile } from '../model/profile';
export interface OnboardingState {
  profile: WriterProfile | null;
  status: 'loading' | 'ready' | 'error';
  saving: boolean;
  error: string;
  questionnaireOpen: boolean;
  openQuestionnaire: () => void;
  closeQuestionnaire: () => void;
  reload: () => Promise<void>;
  save: (input: ProfileInput) => Promise<boolean>;
}
export const OnboardingContext = createContext<OnboardingState | null>(null);
export const useOnboarding = () => useContext(OnboardingContext);
