import { useState, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from '@/features/auth';
import { AdventureDeletionDialog } from '@/features/adventure-deletions';
import { ThemeProvider } from '@/shared/theme';
import { Button, Card, PageHeader } from '@/shared/ui';
import { fixtureDeletionAdventure } from './fixtures/adventureDeletionDialogFixture';
import '@/styles/globals.css';
export function Preview() {
  const [open, setOpen] = useState(false);
  return (
    <main className="p-6">
      <PageHeader title="Exclusão de aventuras" description="Prévia isolada com dados fictícios" />
      <Card className="p-6">
        <Button onClick={() => setOpen(true)}>Abrir exclusão de aventura</Button>
      </Card>
      <AdventureDeletionDialog
        adventureId={fixtureDeletionAdventure}
        open={open}
        onClose={() => setOpen(false)}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <Preview />
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
);
