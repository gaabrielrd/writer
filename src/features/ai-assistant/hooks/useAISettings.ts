import { createContext, useContext } from 'react';
export const AISettingsContext = createContext<() => void>(() => undefined);
export const useAISettings = () => useContext(AISettingsContext);
