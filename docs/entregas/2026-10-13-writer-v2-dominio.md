# Writer V2 — Contratos de domínio e corpus

- **Data:** 2026-10-13.
- **Branch/base:** `codex/writer-v2`, `5f1cd63`.
- **Plano:** [W2-F1-02](../tasks/writer-v2/fase-01-direcao-e-fundamentos/02-modelo-de-dominio.md).

## Objetivo e resultado

Definir contratos compatíveis com os livros existentes e com duas mesas independentes,
usando edições congeladas, variantes particulares e promoção explícita de cânone.
Entrega de contratos/simulação, sem migração ou funcionalidades novas no aplicativo.

## Critérios documentais

- [x] Modelos/serviços confirmados pelo grafo após a integração da master.
- [x] Entidades têm autoria, revisão, origem, armazenamento e ciclo de exclusão definidos.
- [x] Livro e duas campanhas simulados, incluindo origem alterada/removida e privacidade revogada.
- [x] Contrato preserva IDs/atos/conteúdo e prevê migração aditiva, backup e restauração.
- [x] Corpus real de livro/aventura medido privadamente, sem conteúdo copiado ao repositório.
- [x] Revisão independente concluída e gate completo local verde.
- [ ] Provas funcionais de campanhas, histórico/migração e CI: pendentes das implementações pertinentes.

## Arquivos alterados

| Área                                                            | Mudança                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Contrato](../tasks/writer-v2/execucao/02-modelo-de-dominio.md) | Entidades, cenários, medições, limites, concorrência, exclusão e proposta de ADR |
| W2-F1-02 e registro de execução                                 | Estado/evidência local                                                           |
| W2-F1-01 e suas jornadas                                        | Atualização do inventário de corpus real                                         |
| Decisões e riscos                                               | D-01/D-02 fechadas para contratos iniciais, limites futuros ainda explícitos     |
| Este registro                                                   | Evidência da entrega documental                                                  |

## Testes e validações

Nenhum código, regra, dependência ou teste de comportamento alterado.
Ambiente Windows, Node 24.21.0/npm 10.6.0; dependências functions instaladas nesta base.

| Verificação                            | Resultado observado                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| Medição pypdf                          | Aventura: 64 páginas/280.725 bytes de texto; livro: 327 páginas/477.385 bytes de texto      |
| Ensaio UTF-8 Node                      | 100.000 pontos de código: 100.000/200.000/400.000 bytes ASCII/acentos/emoji                 |
| Revisão independente                   | 31 links existentes; P2 de restauração de base revogada corrigido e reconferido             |
| npm run validate                       | Código 0: todos os gates passaram                                                           |
| Frontend/cobertura                     | 116 arquivos/851 testes; 92.84% statements, 86.41% branches, 91.32% functions, 94.93% lines |
| Backend/syntax                         | 87 passaram, zero falhas; syntax check passou                                               |
| Scripts, lint, typecheck, build, smoke | Passaram no gate                                                                            |
| Docs e diff após correção documental   | Passaram                                                                                    |

```text
 Test Files  116 passed (116)
      Tests  851 passed (851)
All files          |   92.84 |    86.41 |   91.32 |   94.93 |
ℹ tests 87
ℹ pass 87
ℹ fail 0
Smoke test do bundle OK.
```

Revisão corrigiu restauração/comparação de variantes: autorização/privacidade vigente
é obrigatória; base revogada não volta a ser entregue. Notas autorais particulares ficam separadas.
Checks documentais são repetidos após preencher este registro. Build mantém avisos
de chunks grandes/importação dinâmica de exportDocx; cobertura não foi reduzida.

## Fora do escopo e limitações

Sem migração real, mudança de schema em produção, permissões implantadas, push ou deploy.
Medição de texto não comprova importação visual, hierarquia, funcionamento do editor
ou desempenho sob carga. PDFs são corpus privado; não autorizam distribuição comercial.
Limites por mediaType, gravação real/emulador, retenção, capacidade comercial e pilotos
humanos precisam de evidência nas tarefas responsáveis. CI no PR não executado.

## Verificação manual

1. Ler a tabela de contratos e conferir separação de original, edição e campanha.
2. Percorrer a simulação C1/C2, incluindo descarte de variante com base revogada.
3. Conferir medições e hashes; nenhum texto/imagem dos PDFs integra o repositório.
4. Conferir critérios funcionais ainda abertos no plano e a evidência exigida por feature.
