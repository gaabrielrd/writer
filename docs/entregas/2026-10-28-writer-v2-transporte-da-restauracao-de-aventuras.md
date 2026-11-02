# Writer V2 — transporte autenticado da restauração de aventuras

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: e3c3c05.
- Plano: [189](../tasks/writer-v2/execucao/189-transporte-autenticado-da-restauracao-de-aventuras.md).
- Decisão: [ADR 0211](../decisions/0211-adventure-restore-callable-boundary.md).

## Objetivo e funcionalidades

Os 29 comandos de restauração de aventuras agora têm exports Functions e seleção
explícita, com Auth/App Check, limites e respostas privadas. O futuro cliente pode
usar o pipeline existente por essa fronteira; leitores/chaves/helpers não são
expostos. Nenhum nome no payload escolhe outro comando.

Recursos preservados: us-central1, 512MiB, maxInstances 5, timeout 540 s para
validação e 120 s para os demais. Não há segredo de IA ou débito nesse transporte.
GenerationError/reason passa pela tradução pública existente; erro inesperado
retorna unavailable sem detalhes privados. Headers privados cobrem comandos
executados e erros da aplicação; recusas anteriores de middleware não ecoam entrada.

## Aceites

- [x] Lista fechada imutável e 29 exports exatos, sem ports internos/chave.
- [x] UID/middleware/configuração/headers/erros seguros comprovados.
- [x] Contratos reais fechados até ativação, mídia, coleta e replay.
- [x] Testes dirigidos/HTTP/SDK, revisão/docs/evidência e commit local.
- [ ] Recuperação HTTP/chaves, cliente e interface/roundtrip.
- [ ] Validate integral do próximo grande bloco.

## Arquivos alterados

adventureRestoreCallable novo; composição/timeout/exports no index; comentário
do Transfer atualizado para o novo contrato de transporte. Dois testes Node e
um SDK novos. ADR/AGENTS/arquitetura/testes/progresso/índice/plano atualizados.
Sem dependência, índice ou mudança de Rules.

## Testes dirigidos e HTTP

**162/162 Node**, sem falhas/skips/cancelamentos, em **4.135,306 ms** totais:
**78 casos novos** e **84 regressões** de transporte de livros e bootstrap.
Cobrem cada comando, allowlist congelada, método herdado/inesperado/não função,
UID inválida antes do serviço, headers, reason e fluxo real até mídia/coleta.

Inventário real do index confirma os 29 callables, região/memória/maxInstances/
timeout, segredo vazio e ausência de recuperação/leitores internos. HTTP real
prova App Check ausente/inválido, Auth ausente/inválida, entrada extra rejeitada
e erro inesperado sanitizado com headers privados. Verificadores sintéticos
existem somente no teste; nenhuma opção de bypass foi criada em runtime.

A primeira rodada passou **77/78** em **1.406,560 ms**: uma expectativa arbitrária
de quantidade de comandos visitados não se aplicava ao arquivo mínimo, que não
usa todas as operações opcionais. Removida a contagem; mantidas as verificações
dos resultados reais de ativação, mídia, coleta, estado, entrada fechada e
cancelamento. Retake selecionado **1/1**, **716,893 ms**, e rodada integrada
162/162 acima passaram. A implementação não foi relaxada para isso.

Formatação/ESLint dirigidos, sintaxe das **389 Functions** e arquitetura passaram.
Documentação/diff finais passaram. Scan dos 14 arquivos sem segredo identificado,
.env ou artefato acima de 5 MiB; seis hashes de módulos/testes conferidos. Suíte frontend/build
não repetidos: não houve mudança de interface/TypeScript; validate integral
fica no próximo grande bloco, conforme orientação do operador.

## SDK nativo

**1/1 verde**, **107.868,995 ms** totais; caso em **105.840,001 ms**. Firestore
demo 1.22.0 em loopback 59229. Um servidor HTTP local monta os exports reais;
todas as operações passam por esses wrappers e pelo Firestore SDK real.

O fluxo prepara arquivo mínimo, prova a raiz/job privados antes da ativação,
nega outra conta, ativa a nova cópia, confirma leitura própria da raiz e nega
leitura estrangeira, finaliza mídia vazia, coleta a fonte e confirma ativação
histórica após a coleta. Os comandos executados têm no-store/Vary Authorization.
Rules continuam negando leitura SDK direta do job. JVM e servidor próprios
encerrados; ausência do emulador conferida.

Auth/App Check usam verificadores sintéticos apenas no processo de teste.
Isso comprova integração do middleware/dispatch/contratos/SDK, não a validade
de tokens reais, credenciais, IAM, implantação ou disponibilidade de produção.
O teste mínimo não possui imagens; os cenários de mídia real continuam na
evidência e suíte do bloco 186–188.

## Revisão e limites

Revisão confere dispatch anterior ao fallback, ausência de lookup por payload,
UID antes do serviço, exports literais e preservação de livros/segredos/limites.
O validate integral de e3c3c05 permanece baseline, sem ser atribuído ao código novo.

Sem CI, push/PR, merge/deploy ou subagentes. Recuperação HTTP/chaves, controlador/
journal cifrado/tela/roundtrip, P2/P3/D/F2-09, fases 3–5 e condições humanas/
comerciais continuam abertos. Macro 8/35 inalterada.
