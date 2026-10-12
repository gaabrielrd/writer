import { createContext, useContext } from 'react';
interface OpenAISettings {
  (): void;
  (tab: 'personas' | 'provider'): void;
}
export const AISettingsContext = createContext<OpenAISettings>(() => undefined);
export const useAISettings = () => useContext(AISettingsContext);
