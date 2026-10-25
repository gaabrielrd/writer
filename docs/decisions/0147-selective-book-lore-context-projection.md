# ADR 0147 — Projeção seletiva do lore nos contextos

- Status: marco A implementado localmente; integração do chat pendente.
- Data: 2026-10-25.
- Plano: [128](../tasks/writer-v2/execucao/128-projecao-logica-do-lore-para-contextos.md).

## Contexto

Cabeças nativas guardam metadata e ponteiros, sem nomes/detalhes. O leitor
integral da análise monta também conteúdo que matcher e snapshot não utilizam.

## Decisão

Observadores opcionais nos parsers existentes recebem início, codepoints e fim
de strings. Checkpoints e gramática permanecem idênticos, sem prosa. Coleta em
RAM não certifica bytes; somente sai após finalizar domínio, sintaxe e hashes.

Projeção fechada de name/category/summary/details/aliases permite textos integrais
ou prefixos UTF16 sem dividir codepoint. Preserva ausências, vazios, duplicados,
ordem e contagem total de aliases, com flags de omissão/truncamento.
Defaults visuais pertencem ao consumidor.

BookLoreContextRead autoriza o livro e abre C1 na mesma transação. Base v1 é
certificada em fluxo sem montar texto integral. v2 coleta campos efetivos e
não baixa corpos de relações/outros campos não pedidos. Campo sobrescrito na
base é validado sem retenção. isPublic efetivo é conferido contra a cabeça.
Nenhum DTO visual ou token fornecido pelo chamador autoriza a leitura.

Partes conservam escopo, abertura, nascimento e Merkle; corpo consumido conserva
comprimento/SHA e UTF8/JSON/domínio até o fim, mesmo para prefixo. Manifesto físico
é comparado por sua projeção de transporte, preservando validações nativas.

Consumidor fornece limites explícitos de bytes, partes e retenção lógica, sem
defaults. Reserva I/O antes dos chunks e custo de contêiner até para strings
vazias. Falha rejeita toda a projeção. Retenção lógica não mede heap exato.

## Consequências e limites

Monolítico v1 exige todo o I/O da base; somente v2 evita outros campos.
Não saltar bytes sem índice certificado de intervalos e alegar SHA integral.
Budget de contexto não impõe limite próprio de ficha, autoria ou backup.

Marco A não integra editorChat. Marco B deve preservar matcher/precedência,
limites de apresentação e autorização por nascimento. Histórico reautoriza
origem sem baixar corpo nem mudar identidade para a revisão atual.

[Evidência](../entregas/2026-10-25-writer-v2-projecao-seletiva-do-lore.md):
156 Node e quatro SDK positivos. Nenhuma RPC/Rule/dependência ou rollout.
Demais P1/fases/gates humanos e comerciais permanecem necessários.
