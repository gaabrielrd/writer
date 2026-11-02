export interface FunctionDomain {
  options: {
    region: string;
    enforceAppCheck: boolean;
    timeoutSeconds: number;
    memory: string;
    maxInstances: number;
  };
  requiresGenerationKey: boolean;
  sourceFactory: string;
  actions: Readonly<Record<string, string>>;
}
export const FUNCTION_DOMAINS: Readonly<Record<string, FunctionDomain>>;
export const FUNCTION_ROUTES: Readonly<Record<string, string>>;
export const STREAMING_FUNCTIONS: readonly string[];
