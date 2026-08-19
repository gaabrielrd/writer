/// <reference types="vite/client" />

/**
 * Variaveis de ambiente expostas ao front-end. Declare aqui cada variavel
 * `VITE_` usada pelo projeto para que o TypeScript acuse erros de digitacao
 * em vez de devolver `any`. A validacao em tempo de execucao fica em
 * `src/shared/config/env.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
