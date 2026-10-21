# Writer V2 — Contêiner limitado de backup de livros (P1 M2)

- **Data:** 2026-10-21
- **Branch:** codex/writer-v2
- **Plano:** [contrato M2](../tasks/writer-v2/execucao/33-conteiner-limitado-de-backup.md),
  parte de [P1](../tasks/writer-v2/execucao/31-portabilidade-de-livros.md).
- **Estado:** marco interno implementado e validado localmente; CI do novo head pendente.
  Não entrega backup/restauração completos e não fecha F2-09.

## Objetivo

Preparar a leitura e gravação de backups por quadros limitados, preservando bytes
e detectando corrupção antes de confiar no arquivo. A futura restauração ainda
exigirá schema, captura consistente, mídia e autorização no servidor.

## Funcionalidades entregues

- Codec puro compartilhado, contêiner v1 sem compressão, SHA-256 encadeado e selo/EOF.
- Leitura e escrita sob demanda; metadata até 16 KiB e payload até 256 KiB.
  Declarações acima do limite falham antes de ler o corpo.
- Preservação exata de UTF-8 e bytes; rejeição de versão futura, sequência inválida,
  metadata não canônica, corrupção, truncamento e bytes após o selo.
- Cancelamento antes/depois de I/O/hash; writer não solicita outro registro após
  abortar e encerra o iterador. Erro de captura não produz selo.
- API pública da feature folha book-portability e adaptador Blob que materializa
  somente o intervalo pedido, sem ler o arquivo todo.
- ADR 0045 e regra de consumo provisório: registro emitido não autoriza ativação.

## Critérios de aceite deste marco

- [x] Vetor binário independente confere bytes e digest no Node e Chromium.
- [x] Comprimentos maliciosos são recusados antes de ler/alocar o corpo.
- [x] Corrupção, selo, EOF, Unicode, erros e cancelamento têm provas direcionadas.
- [x] Leitura local e contrato público verificados sem dependência nova.
- [x] Validate completo verde; diff revisado, sem segredos ou artefatos grandes.
- [ ] CI geral do novo head verde (acompanhada sem bloquear o próximo incremento).
- [ ] Backup/restauração P1 completos (fora do aceite M2, continuam pendentes).

## Arquivos alterados

| Grupo                                                      | Mudança                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| functions/src/bookBackupContainer.mjs e .d.mts             | Wire puro e tipos compartilhados.                                             |
| functions/test/bookBackupContainer.test.mjs e fixture JSON | 20 testes e vetor binário de 404 bytes.                                       |
| functions/package.json                                     | Inclui syntax check do novo contrato, sem dependência.                        |
| src/features/book-portability                              | Exportações públicas e adaptador Blob, com 3 testes.                          |
| docs/architecture.md, testing.md, ADR 0045 e planos P1/M2  | Fronteiras, comandos, formato e pendências.                                   |
| AGENTS.md                                                  | Exige selo/EOF antes de confiar no contêiner e validação de domínio separada. |

## Testes e validações reais

```text
Node dirigido: tests 20; pass 20; fail 0; duration_ms 102.0326
Vitest dirigido: Test Files 1 passed; Tests 3 passed; Duration 1.17s
npm run validate
exit 0
Test Files 220 passed (220)
Tests 2548 passed (2548)
Coverage: 90.98 statements / 85.64 branches / 90.68 functions / 93.62 lines
Scripts: tests 85; pass 85; fail 0
Functions: tests 655; pass 655; fail 0
Smoke test do bundle OK.
```

Limites de cobertura preservados (85/75/90/85). Arquitetura, documentação,
styleguide, formato, lint, syntax checks, tipos e build passaram. npm ci --prefix
functions instalou 251 pacotes, auditou 252 e encontrou zero vulnerabilidades;
avisos existentes: engine Functions Node 22 versus ambiente 24.21.0/npm 10.6.0,
dependências deprecadas. Build conserva avisos de chunks grandes e importação
estática/dinâmica de exportDocx; não foram suprimidos.

A primeira execução dirigida revelou transporte incorreto de Unicode na criação
dos novos arquivos e comparação de TypedArray entre realms no teste. Corrigidos
antes da validação final; o vetor independente agora confere bytes exatos. O
teste de mutação foi sincronizado no await real do hash, sem depender de microtask.

### Chromium nativo

Cinco casos passaram em 2.907 ms, com Blob e Web Crypto reais e secureContext=true:
vetor/roundtrip, selo corrompido, comprimento malicioso antes do corpo, abort
durante read e 12 registros de payload máximo. Arquivo sintético de 3.147.187 bytes,
maior read observado de 262.207 bytes; zero erros de runtime e requisições externas.
Não houve retry, fixture Firebase ou uso de provedor pago.

A criação do Blob inteiro foi deliberada somente para construir a fixture de teste;
não demonstra orçamento do exportador de produto nem mede heap do navegador.
A prova foi no servidor Vite local; não é jornada de restauração do bundle publicado.
Nenhuma UI, Rule ou writer persistente mudou, portanto não repetimos a suíte
visual/SDK inteira para este codec. A CI ainda executará seus checks habituais.

Logs/evidências privados em writer-v2-portability-qa: m2-validate.log,
m2-native.json, run-m2-native.mjs e m2-source-freeze.json (9 hashes de código/teste).
Depois do validate, somente documentação/AGENTS foi alterada; formato, links e
diff foram conferidos novamente sem repetir a suíte completa.

## Revisão e limites

Revisão de escopo, buffers, backpressure, identidade, canonicalização e cancelamento
sem bloqueador restante de M2. Sem Node/I/O no contrato, sem import interno de
outra feature, sem dependência, segredo, arquivo de usuário ou mídia adicionados.

Framing/integridade não valida DTO de livro, partes, duplicatas semânticas, relações,
completude, procedência ou autorização. Registros são provisórios até selo/EOF;
P1 deverá validar o domínio inteiro no servidor antes de ativar nova cópia privada.
Hash não é assinatura/grant. Sem criptografia do arquivo ou persistência em recovery.

Continuam pendentes: schema semântico, captura coerente dos demais recursos e mídia,
streaming da captura M1 que hoje acumula histórico, gravação/fallback por volumes,
revisão, remapeamento, preparação/ativação/cleanup e roundtrip real de livro.
JSON v1–v6 permanece inalterado e sem histórico. Universo segue a escolha confirmada:
religar à origem autorizada, sem duplicar ou sobrescrever fichas globais.
Sem botão de backup parcial, merge, deploy ou fechamento amplo. Contagem permanece
8/35 tarefas amplas; piloto humano e habilitação comercial continuam pendentes.

## Como verificar

Executar os dois comandos direcionados descritos em docs/testing.md. Para provar
o arquivo todo, consumir o leitor até o retorno final validado; interromper
após o primeiro registro não valida o selo. Corromper o último byte deve falhar.
A futura UI P1 só deve usar o resultado depois da validação semântica e dos gates.

## Registro remoto verificado em 2026-10-21

M2 enviado em 2f80f91d1fc110aa420bc669782a3c6ef84437fb: HEAD/upstream/remoto
coincidentes e ambos checkouts limpos naquele fechamento; master original
522ccaa preservada. Hooks normais, com tipos e 2.548/220 testes verdes no pre-push
em 153,47 s. Nove hashes de código/testes/pacote preservados após hooks e envio.

Rules 39687293480 verdes. Na consulta de CI 39687293696 antes da manutenção,
Node 22/24, auditoria, produção e shards 8 e 12 estavam verdes; demais visuais
ainda em execução. Isso não é aprovação geral. O ajuste dirigido seguinte de
teste/CI avança sem esperar a matriz; resultados remotos continuam próprios.
