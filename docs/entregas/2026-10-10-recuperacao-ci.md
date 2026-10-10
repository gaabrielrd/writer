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
- Teste de transporte passou com gRPC 1.9.16 e, após nova instalação limpa
  de 550 pacotes, com 1.13.6: 1 teste, 1 passou, 0 falhou.
- Primeiro CI: auditoria e validação Node 22/24 passaram; E2E passou navegação e
  três paletas, detectando a duplicação de ThemeProvider no fluxo de sistema.
  O SHA corrigido ainda precisa de confirmação integral.

## Limitações e critérios para merge

O bootstrap deixa de montar um segundo ThemeProvider: a duplicação sobrescrevia
o tema escolhido quando a preferência do sistema mudava. O novo E2E detectou
a regressão no CI e permanece cobrindo esse comportamento. TypeScript continua em 6.0.3.
As seis vulnerabilidades moderadas restantes envolvem Vitest e sprintf-js via
Mammoth; não foram usadas atualizações major ou downgrades sugeridos pelo audit.
A comparação de screenshot permanece dependente de baseline por plataforma;
o baseline Linux continua ausente, como antes desta mudança.

Não fazer merge antes de confirmar o transporte corrigido e todos os jobs do CI
no SHA final: validação Node 22/24, auditoria e E2E Chromium. A evidência será
atualizada com os resultados reais.

## Incremento: consolidação das atualizações de dependências

O PR #13 foi integrado após todos os checks do SHA
`cea0fe5c938b6edfa0cd4c472b82ef0c10a37abe` passarem. O commit resultante
`be4da8fc61e147fe752ba826eff9125c90774d9d` também passou validação Node 22/24,
auditoria e Chromium na branch principal.

As atualizações minor/patch dos PRs #11 e #12 foram combinadas, preservando as
versões propostas e as correções de segurança, para validar o grafo completo.
O lockfile combinado passou a verificação de instalação em dry-run e a auditoria
com limite high (6 moderadas, nenhuma alta/crítica). Instalação limpa, regressão
gRPC e os quatro jobs do CI devem passar antes da integração deste incremento.
Dependabot encerrou automaticamente o PR #11 durante a preparação. A consolidação
segue em PR próprio. O PR #12 só será encerrado como substituído após a integração
validada desta consolidação. A instalação limpa combinada passou (557 pacotes),
assim como o teste real de transporte gRPC corrigido (1 teste, 0 falhas).
