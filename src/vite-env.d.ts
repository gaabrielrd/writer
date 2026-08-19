/// <reference types="vite/client" />

/**
 * Variaveis de ambiente expostas ao front-end. Declare aqui cada variavel
 * `VITE_` usada pelo projeto para que o TypeScript acuse erros de digitacao
 * em vez de devolver `any`. A validacao em tempo de execucao fica em
 * `src/shared/config/env.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET?: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
