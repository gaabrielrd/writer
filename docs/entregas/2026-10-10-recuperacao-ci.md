# Recuperação dos contratos E2E e auditoria

- **Data**: 2026-10-10
- **Branch**: `fix/restore-ci-contracts`
- **Plano de origem**: plano aprovado na conversa
- **Estado**: validação em andamento; não representa aprovação para merge

## Objetivo e alterações

Restaurar a proteção de navegação e temas após a migração visual já implementada,
e corrigir dependências vulneráveis sem reduzir os gates.

- O smoke verifica a página inicial atual, login/cadastro sem autenticação real,
  Back/Forward, fallback e retorno ao início.
- O contrato visual verifica tokens e cores aplicadas nos temas claro, escuro e
  sépia, persistência, alternância e preferência do sistema.
- Atualizações compatíveis de xmldom, brace-expansion, source-map-js e undici.
- Override restrito ao transporte gRPC de Firestore, de 1.9.16 para 1.13.6,
  corrige GHSA-m9gg-hp2v-232j. A versão está fora do pin upstream ~1.9.0, mas
  dentro do mesmo major. O teste local de transporte usa o SDK Firestore real
  contra um servidor gRPC isolado, cobrindo leitura transacional e commit.

## Evidência disponível

- Instalação limpa inicial: 546 pacotes instalados.
- Skills, arquitetura, documentação, styleguide, formatação e lint passaram;
  lint mantém um aviso preexistente em LoginPage.
- Validação completa local interrompida após timeout em teste de EditorPage sob
  restrição de recursos; não é considerada verde.
- Chromium empacotado não pôde ser instalado (arquivo recebido inválido).
  Chromium do sistema não inicia no sandbox (socket não permitido). E2E deve
  ser confirmado pelo workflow Chromium existente.
- Auditoria do lockfile atualizado: 0 críticas, 0 altas, 6 moderadas.
  O gate permanece `npm audit --audit-level=high`, sem alteração.
- Teste de transporte passou com a versão anterior; confirmação da versão
  corrigida e validação completa do SHA final ainda pendentes.

## Limitações e critérios para merge

Nenhuma mudança de produção na interface. TypeScript continua em 6.0.3.
As seis vulnerabilidades moderadas restantes envolvem Vitest e sprintf-js via
Mammoth; não foram usadas atualizações major ou downgrades sugeridos pelo audit.
A comparação de screenshot permanece dependente de baseline por plataforma;
o baseline Linux continua ausente, como antes desta mudança.

Não fazer merge antes de confirmar o transporte corrigido e todos os jobs do CI
no SHA final: validação Node 22/24, auditoria e E2E Chromium. A evidência será
atualizada com os resultados reais.
