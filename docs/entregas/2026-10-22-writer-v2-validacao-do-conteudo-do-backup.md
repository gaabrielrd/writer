# Writer V2 — Validação do conteúdo do backup (P1 M11)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, desenvolvimento local.
- **Plano:** [contrato 44](../tasks/writer-v2/execucao/44-validacao-semantica-do-pacote.md).
- **Decisão:** [ADR 0055](../decisions/0055-book-backup-content-validation.md).
- **Estado:** marco interno com checks dirigidos; P1/F2-09 continuam abertos.

## Implementado

- [x] DTOs fechados para livro, estrutura, doze recursos, personas, origem,
      histórico, rascunho e capa do formato novo.
- [x] JSON/UTF-8 canônico, partes sequenciais, duplicatas e endereços SHA-256.
- [x] Hash/bytes integrais de corpos/fontes, histórico, draft e capa.
- [x] Contagens por capacidade, coerência raiz/origem/capa, donos e estilos.
- [x] Pai estrutural obrigatório, corpo por cena, perfil consistente e overrides válidos.
- [x] Ranks únicos somente na sequência e slot ativos; arquivo de cenas preservado.
- [x] Avisos sem perda para metadados ausentes, grupos órfãos e referências neutras.
- [x] Índice OPFS protegido, memória limitada, cleanup e cancelamento.
- [ ] JSON v1–v6, UI, materialização/ativação/remapeamento e recuperação.

Contrato puro Functions recebe portas de índice/hash; adaptador cliente usa Noble
já instalado, OPFS e Web Crypto da plataforma. Nenhuma dependência nova, API
remota, Rule, coleção, débito ou escrita no livro. Sem botão/seletor externo.

## Testes Node e cliente

Node dirigido final: **35/35** em 444 ms, incluindo **onze novos** do conteúdo,
vinte do codec M2 e quatro do envelope. Fixtures geram novo selo válido após
adulteração e conferem envelope positivo antes da rejeição semântica.
Cobre todas as famílias, órfãos, versões removidas, campos/contagens falsos,
hashes de corpo/fonte/draft/histórico/capa, endereços e perfis conflitantes.
Inclui JSON duplicado/não canônico, partes inválidas, UTF-8/surrogate inválido,
item acima de 8 MiB, árvore com pai ausente, modo errado do agrupador,
slots de rank A/B, override desconhecido, índice indisponível e abort.

Caso grande valida draft de **3.300.003 bytes** e título multipartido Unicode,
com leituras de arquivo menores que 70.000 bytes. Índice da fixture conserva
somente metadados de identidade; teste verifica ausência de prosa/títulos.
Fixtures de índice em memória são somente porta de teste, não fallback de produto.
Capa Node usa PNG pequeno real, teste de hash e assinatura; não é prova de
decodificação segura geral de imagens na restauração.

Vitest da inspeção primeiro **5/5**, lote de portabilidade **119/119** em 5,53 s.
Depois de endurecer congelamento de sinal e cancelamento após cleanup,
apenas a inspeção afetada foi repetida: **7/7**, 1,20 s.
Adaptador protegido recebeu **6/6**, 1,17 s: Web Crypto real com filesystem fake,
roundtrip, nomes opacos/ciphertext, duplicata, adulteração/truncamento,
limites, quota simulada, falha de crypto/cleanup e isolamento/cancelamento.
Não alegar que os 127 casos distintos foram executados num único lote final.

Primeiro teste de duplicata esperava erro do índice, mas duplicatas adjacentes
já falhavam na sequência de partes; a fixture passou a separar as duas entradas
para provar também a unicidade pelo índice. Lint exigiu cause do erro de cleanup
nos catches internos; ambos os erros continuam preservados no agregado.
Revisão detectou aviso indevido de updatedAt em fonte que só possui createdAt;
corrigido sem inventar data. IDs locais de lore têm precedência mesmo quando
parecem prefixos externos; vetor específico cobre também referência global real.
Últimos lotes dirigidos: 11/11 Node (403 ms) e 13/13 cliente (1,31 s). A fixture
de filesystem foi ajustada à opção erasableSyntaxOnly do TypeScript.

## Prova nativa

Dois probes Chromium reais com Firestore 1.22.0/Storage 1.1.3 locais e serviços do
checkout, sem produção. Primeiro: **11 cenários em 48,00 s**. Após ajustes de ranks/
avisos, repetir somente inspeção/índice e composição necessária: **12 cenários em
19,29 s**, processo Node test positivo (20,26 s). Coberturas se sobrepõem.

Arquivo final OPFS: **1.462.103 bytes, 170 registros** nas sete seções.
Relatório content-only confirma 58 versões/61 partes/216.003 bytes de histórico,
216.003 bytes de draft e 367.074 bytes da capa. Três perfis únicos,
uma estrutura atual, doze tipos de recursos, quatro referências externas e
um grupo órfão; zero avisos de data ausente inventados. PNG é decodificado pelo
navegador em 1200x1800 com SHA-256 independente.

Índice real: nenhum ID nos nomes dos arquivos ou plaintext nos bytes, ciphertext
adulterado rejeitado, diretórios removidos no sucesso/arquivo inválido/abort.
Limpar uma operação preserva a outra. Cancelamento após vinte leituras do arquivo
não devolve relatório positivo nem deixa índice. Nenhum coletor do projeto no
caminho de produção; arrays de partes existem apenas nas asserções do probe.

Zero erros de runtime do navegador e requisições externas bloqueadas.
Ponte local usa UID de teste fixo: autorização/Rules são provas separadas de
marcos anteriores, não nova cobertura Auth/App Check ou de produção.
OPFS comprova plataforma/disco, sem diálogo externo ou UI de revisão.
Quota foi simulada no teste unitário, não esgotada no dispositivo real.

## Checks, revisão e continuidade

Build/typecheck/bundle/smoke, sintaxe Functions, lint dirigido e arquitetura
passaram. Ajustes finais só do ciclo de cancelamento tiveram teste/tipos/lint
dirigidos; não repetir os probes de captura por isso. Documentação/formato/diff
conferidos no fechamento. Revisão local sem subagentes.

Continuam avisos de bundle grande/imports estáticos-dinâmicos e listeners da
pipeline Storage/teeny-request registrados em M9/M10; sem supressão, mudança de
dependência ou alegação de ausência de vazamento. Auditoria não repetida;
baseline M4 mantém três moderados preexistentes.

Validate completo permanece para fechar P1. Sem CI consultada/disparada, push,
PR, merge ou deploy. Original master em E preservada. Próximo incremento é
leitura JSON v1–v6 com revisão de ausências. Nenhuma tarefa ampla adicional é
declarada concluída apenas por este marco.

## Reprodução dirigida

```bash
node --test functions/test/bookBackupContent.test.mjs functions/test/bookBackupPackage.test.mjs functions/test/bookBackupContainer.test.mjs
npx vitest run src/features/book-portability/tests/inspectBookBackupContent.test.ts src/features/book-portability/tests/bookValidationIndex.test.ts
npm run typecheck
npm run build
npm --prefix functions run check
```

Probes/relatórios privados m11-native e m11-native-content ficam no diretório
writer-v2-portability-qa dos artefatos da sessão, fora do Git.
