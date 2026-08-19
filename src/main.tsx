import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import '@vitru/styleguide/styles.css';
import { router } from './app/routes';
// Valida as variaveis de ambiente antes de montar a aplicacao: uma
// configuracao ausente ou malformada falha aqui, com mensagem clara, em vez
// de virar `undefined` em algum ponto distante do codigo.
import './shared/config';
import './styles/themix.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento raiz #root não encontrado no index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
