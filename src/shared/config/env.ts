/**
 * Leitura tipada e validada das variaveis de ambiente.
 *
 * O Vite injeta `import.meta.env` estaticamente no build. Sem validacao, uma
 * variavel ausente ou malformada vira `undefined` e so aparece muito depois,
 * como um erro sem relacao aparente. Aqui a configuracao falha no boot, com
 * mensagem que diz exatamente qual variavel corrigir.
 *
 * Para exigir uma variavel nova, acrescente a chave em `REQUIRED_KEYS` e
 * exponha o valor em `Env`. Lembre-se: tudo que chega ao browser e publico,
 * entao nunca coloque segredos aqui.
 */

/** Variaveis sem as quais a aplicacao nao deve subir. */
const REQUIRED_KEYS: readonly string[] = [];

export interface FirebaseConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly storageBucket: string;
  readonly messagingSenderId: string;
  readonly appId: string;
  readonly measurementId?: string;
}

export const DEFAULT_FIREBASE_CONFIG: FirebaseConfig = {
  apiKey: 'AIzaSyB1mNeWUowIT4o638JUf9vJBGWhp6I4vAY',
  authDomain: 'writer-44cd5.firebaseapp.com',
  projectId: 'writer-44cd5',
  storageBucket: 'writer-44cd5.firebasestorage.app',
  messagingSenderId: '404822288771',
  appId: '1:404822288771:web:4f1b6e123c716374d76eb6',
  measurementId: 'G-XXK14L9PFH',
};

export interface Env {
  /** Modo do Vite: `development`, `production` ou um modo customizado. */
  readonly mode: string;
  readonly isProduction: boolean;
  /** Base da API, quando o projeto usa uma. */
  readonly apiUrl: string | undefined;
  /** Configuração do Firebase */
  readonly firebase: FirebaseConfig;
}

export class EnvValidationError extends Error {
  constructor(problems: readonly string[]) {
    super(
      `Configuracao de ambiente invalida:\n${problems.map((p) => `  - ${p}`).join('\n')}\n` +
        'Copie .env.example para .env.local e preencha os valores.',
    );
    this.name = 'EnvValidationError';
  }
}

function readOptional(raw: ImportMetaEnv, key: string): string | undefined {
  // `ImportMetaEnv` traz um index signature `any` vindo de vite/client;
  // estreitar para `unknown` mantem a leitura segura.
  const value: unknown = (raw as Record<string, unknown>)[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function readUrl(raw: ImportMetaEnv, key: string, problems: string[]): string | undefined {
  const value = readOptional(raw, key);
  if (value === undefined) return undefined;

  try {
    // Normaliza e rejeita valores que nao sao URL absoluta.
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    problems.push(`${key} deve ser uma URL absoluta. Recebido: "${value}".`);
    return undefined;
  }
}

/**
 * Monta o objeto de configuracao a partir de um `import.meta.env`.
 * Exportado separadamente para permitir teste sem depender do ambiente real.
 *
 * @throws {EnvValidationError} quando alguma variavel esta ausente ou invalida
 */
export function createEnv(raw: ImportMetaEnv): Env {
  const problems: string[] = [];

  for (const key of REQUIRED_KEYS) {
    if (readOptional(raw, key) === undefined) {
      problems.push(`${key} e obrigatoria e nao foi definida.`);
    }
  }

  const apiUrl = readUrl(raw, 'VITE_API_URL', problems);

  if (problems.length > 0) throw new EnvValidationError(problems);

  const firebase: FirebaseConfig = {
    apiKey: readOptional(raw, 'VITE_FIREBASE_API_KEY') ?? DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain:
      readOptional(raw, 'VITE_FIREBASE_AUTH_DOMAIN') ?? DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: readOptional(raw, 'VITE_FIREBASE_PROJECT_ID') ?? DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket:
      readOptional(raw, 'VITE_FIREBASE_STORAGE_BUCKET') ?? DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId:
      readOptional(raw, 'VITE_FIREBASE_MESSAGING_SENDER_ID') ??
      DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: readOptional(raw, 'VITE_FIREBASE_APP_ID') ?? DEFAULT_FIREBASE_CONFIG.appId,
    measurementId:
      readOptional(raw, 'VITE_FIREBASE_MEASUREMENT_ID') ?? DEFAULT_FIREBASE_CONFIG.measurementId,
  };

  return {
    mode: raw.MODE,
    isProduction: raw.PROD,
    apiUrl,
    firebase,
  };
}

export const env: Env = createEnv(import.meta.env);
