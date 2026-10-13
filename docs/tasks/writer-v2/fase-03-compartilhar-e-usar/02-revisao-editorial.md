# W2-F3-02 — Abrir rodadas privadas de revisão editorial

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F3-01](../fase-03-compartilhar-e-usar/01-convites-e-acessos.md), [W2-F2-05](../fase-02-criar-e-preparar/05-historico-e-restauracao.md)
**Áreas propostas:** books, editor; proposta editorial e adventures. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Permitir feedback assíncrono sobre uma versão delimitada, sem dar ao revisor acesso ao rascunho vivo.

## Entradas e resultado

Entradas: versão salva, partes selecionadas, convidados e objetivo de revisão. Resultado: rodada privada com comentários vinculados à revisão.

## Escopo e comportamento

- Escolher capítulos/cenas/partes de livro ou aventura e preparar projeção para revisão.
- Fixar revisão de origem para comentário não mudar de significado com edição posterior.
- Comentar trecho ou documento, responder e resolver conversa com autoria/estado.
- Manter notas internas, personas, histórico privado e segredos não escolhidos fora da projeção.

## Passos de execução

- [ ] Definir rodada, projeção e âncora do comentário.
- [ ] Implementar serviços e regras de abertura/fechamento.
- [ ] Montar leitor de revisão e painel de comentários.
- [ ] Cobrir alteração do original, âncora indisponível e retirada do convidado.

## Critérios de aceite

- [ ] Editar manuscrito não altera silenciosamente o texto da rodada.
- [ ] Revisor comenta sem modificar prosa nem receber lore privado.
- [ ] Comentário deslocado é marcado como ligado à versão anterior.
- [ ] Fechar rodada ou revogar acesso produz comportamento explícito.

## Validação

- Modelo: âncoras e revisão de origem.
- Regras/E2E: seleção parcial, revisor/terceiro e versão editada durante revisão.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Âncoras de texto rico podem ser frágeis; reter versão e fallback de comentário geral.
- Expansão de coleção pública não é solução para revisão privada.

## Não escopo

Cursores ao vivo, edição direta por revisor e publicação pública de comentários.
