# P2 — compatibilidade das imagens com aventura importada

Base: 8279e78. Auditoria antes do selo encontrou integração real omitida pelos
fixtures de criação no Estúdio: adventureImport prepara cenas/corpos/partes
antes da ativação, que cria a raiz. Leitor 155 exigia nascimento de todo head
após raiz e rejeitaria essas cenas legítimas, inclusive sem imagem.

Fontes: adventureImport/Contracts e testes completos. Histórico não é criado
durante staging; versões manuais nascem depois da raiz e seu guard 153 continua.
Imagens não são importadas nesse fluxo; setAdventureBlockImage cria o uso tipado
depois da ativação. Root schema/owner/path e identidade do head continuam provas
necessárias, mas o nascimento do head não certifica o grant do asset.

## Correção planejada

Remover somente comparação head/cena dona >= raiz do reader 155, mantendo
identidade nativa válida, schema 1/owner/flags e backlink. Para bytes, continuar
exigindo library privada ativa, caminho canônico, uso tipado exato e nascimento
desse uso >= raiz atual. Biblioteca pode ser anterior. Cena antiga legítima/
importada pode ser autorizada por uso novo; uso de raiz recriada não é adotado.

Não depender de job/recibo de importação para abrir imagem: grant atual é o uso
tipado gerado pelo writer normal após ativação. Nenhuma chave de recuperação/
revisão/PDF ou prosa de job entra no backup. Não alterar importador, writer,
RootSource, formatos, namespace, Rules, runtime ou dependências.

## Sequência e testes

1. Fixture pelo importador real: start, chave, append, materialize e activate;
   comprovar createTime da cena anterior à raiz e leitura de vínculos null.
2. Vincular imagem pelo writer real depois da ativação; comprovar grant nativo
   posterior, metadata/ranges/SHA e leitura do texto importado intacta.
3. RED antes da correção e GREEN depois, com versões antigas/raízes recriadas,
   uso ausente/antigo/forjado/dono incorreto e demais regressões 155.
4. SDK real Firestore/Storage reutiliza o cenário atual com origem importada,
   incluindo bytes, generations/Rules e revogação após range. Não criar
   emulador sem seleção dirigida, usar JVM direta e encerramento comprovado.
5. Lint/sintaxe/docs/arquitetura/styleguide/format/diff, revisão, ADR/evidência
   parcial e commit local. Validate integral no fechamento do bloco de leitores.
   Inventário/selo/pacote/restore/UI e P2/P3/D continuam abertos.
   Sem CI/remoto/deploy/subagentes.

## Aceites

- [x] Aventura ativada pelo importador lê null e imagem vinculada depois.
- [x] Uso tipado posterior à raiz continua obrigatório para bytes.
- [x] Importação/prosa/chaves/formatos permanecem intactos.
- [x] Testes/SDK/checks/revisão/docs/commit; pacote integral ainda pendente.

## Resultado dirigido e revisão

RED: os dois casos novos falharam no guard owned antes da correção.
GREEN inicial: 37/37 em 418,2595 ms. Seleção final 50/50 (três novos, 35 imagem,
12 importador), sem skip, em 470,411 ms. Três SDK Firestore/Storage positivos
em 17.191,64 ms sobre origem importada real; avisos SDK preservados na evidência.
Lint dirigido positivo; demais checks finais acompanham commit.

Revisão: somente uso tipado precisa nascer após raiz; head continua de
identidade/autoria/schema válidos. Guard de histórico permaneceu, comprovado
com versão manual posterior à ativação. Nenhum PDF pessoal ou chave é exportado.
[ADR 0180](../../../decisions/0180-adventure-imported-image-authority.md) e
[evidência parcial](../../../entregas/2026-10-26-writer-v2-imagens-de-aventuras-importadas.md).
Inventário/selo/pacote integral/restore/UI/roundtrip e validate pendentes.
