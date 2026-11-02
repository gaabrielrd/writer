# P1 / M38c5a — Diff literal e transporte limitado da edição de lore

## Objetivo e constatações

Preparar o cliente do editor completo para enviar somente os campos/páginas
alterados, com CAS congelado de uma leitura C1 integral. O CRUD atual normaliza
valores e envia relações inteiras; não pode ser reutilizado sobre payloads.
A etapa 5 do plano 81 requer diff e upload por unidades, recuperação e host.
Este incremento entrega captura/planejador/codec e prova de integração real;
host, persistência, endpoints e consumidores continuam necessários.

## Requisitos e sequência

1. Capturar pelo leitor C1 o objeto lógico e readToken da mesma montagem
   reconfirmada. Manter get/list existentes compatíveis. Snapshot privado,
   imutável e somente em memória; token nunca concede autorização servidor.
2. Receber operações explícitas por campo: substituir valor ou remover.
   Comparar presença e valores literais, sem trim/default, normalização Unicode,
   deduplicação ou alteração de datas. Nome/categoria não podem ser removidos.
   Rejeitar campo/valor desconhecido, getters, arrays esparsos e dados inválidos.
3. Plano guarda somente identidade/CAS e alterações. No-op não gera upload.
   Relações em páginas de 64; preservar ordem/duplicatas, ausente versus vazio
   e campos opcionais de cada relação. Enviar só páginas novas/alteradas;
   mudança de contagem deve tratar a forma da última página corretamente.
4. Codec de campo/página com JSON literal e UTF-8 em partes de até 64 KiB,
   sem JSON.stringify/UTF-8 do campo inteiro, sem teto total de 8 MiB/128 partes.
   Duas passagens lineares: SHA/Merkle/manifesto e produção com provas.
   Usar noble já instalado, sem Node/Buffer no runtime navegador.
   Retomada por índice percorre o prefixo uma vez, sem custo quadrático por parte.
5. Intenção/bodyId usam o contrato do servidor: UID/livro/lore/upload/alvo,
   hashes canônicos, domínio e Merkle. Não copiar referência física da origem.
   Congelar valores antes de await e conferir abort/guard por unidade.
6. Testes dirigidos de presença, literal/BOM/Unicode, imutabilidade, relações
   0/1/64/65/130, inserção/remoção/reordenação, campos grandes intocados e
   acima de 8 MiB quando alterados. Igualdade dos manifestos/partes com codec
   servidor e validação de domínio; falhas/cancelamento antes de envio.
7. Integração Vitest com C1 e produtores reais, reserva/composição/adoção:
   modificar campo pequeno e página, preservar bytes grandes intocados,
   readToken/CAS/revogação e replay. Não usar mock de codec como prova.
8. Lint/tipos/arquitetura/build pertinentes, revisão/docs/ADR/AGENTS/evidência
   e commit local. Suite completa/validate no fechamento de P1.

## Arquivos e riscos

Novo planejador/contratos e codec na feature lore, método de captura no
leitor existente e testes. Sem UI/callable novo, novo armazenamento persistente,
dependência, alteração de preço ou mudança no escritor SDK legado.

Supor operações explícitas fornecidas pelo futuro host, sem inferir campos
tocados de uma ficha normalizada pelo formulário antigo. O plano cliente é
somente intenção; todas as provas/autorização/origem continuam no servidor.
Não encerrar edição/criação/exclusão do produto por esta infraestrutura.

Demais writers/consumidores (IA, cenas, narrativa, publicação), backup lógico/
indexado, cliente/host/recuperação/endpoints, ativação/rollout, P1/F2-09/V2,
fases 3–5 e aceites humanos/comerciais permanecem abertos.

## Estado verificado

Implementado internamente, com 175 casos Vitest distintos e cinco smokes
Chromium do codec positivos, além de tipos/lint/arquitetura/build dirigidos.
[Evidência](../../../entregas/2026-10-24-writer-v2-diff-e-transporte-do-lore.md)
e [ADR 0114](../../../decisions/0114-literal-book-lore-client-edits.md)
registram correções iniciais, limites e pendências.

Host, RPCs, recuperação, demais consumidores/backup/ativação/rollout e
validate integral de P1 continuam necessários. Não conclui F2-09/V2.
