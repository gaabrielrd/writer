import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './styles/globals.css';
import { router } from './app/routes';
import { ThemeProvider } from './shared/theme';
// Valida as variaveis de ambiente antes de montar a aplicacao: uma
// configuracao ausente ou malformada falha aqui, com mensagem clara, em vez
// de virar `undefined` em algum ponto distante do codigo.
import './shared/config';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento raiz #root não encontrado no index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider defaultTheme="system">
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
