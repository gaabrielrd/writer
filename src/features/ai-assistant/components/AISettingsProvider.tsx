import { type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { AISettingsContext } from '../hooks/useAISettings';

export function AISettingsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <AISettingsContext.Provider
      value={() => {
        void navigate('/settings/ai', { state: { returnTo: location.pathname + location.search } });
      }}
    >
      {children}
    </AISettingsContext.Provider>
  );
}
