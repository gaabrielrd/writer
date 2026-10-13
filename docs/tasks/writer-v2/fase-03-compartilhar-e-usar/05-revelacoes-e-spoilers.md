# W2-F3-05 — Controlar revelações e spoilers por audiência

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F3-04](../fase-03-compartilhar-e-usar/04-portal-e-materiais-dos-jogadores.md), [W2-F1-03](../fase-01-direcao-e-fundamentos/03-permissoes-e-privacidade.md)
**Áreas propostas:** lore, books; propostas campaigns, publications e access; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Liberar informações conscientemente para jogadores e leitores, sem entregar antecipadamente dados ocultos.

## Entradas e resultado

Entradas: informação, audiência, regra de liberação e confirmação do responsável. Resultado: projeção atualizada com registro de liberação/revogação.

## Escopo e comportamento

- Mestre revela material/pista para grupo ou destinatários permitidos; ação independente de concluir missão.
- Leitor recebe lore segundo regra de capítulo/progresso escolhida em D-04, preservando publicação pública atual até migração explícita.
- Definir público versus convidado: segredo exige autenticação/autorização; marcador no navegador não é barreira.
- Revogar original global propaga invalidação monotônica; revelação local não concede acesso ao universo privado.

## Passos de execução

- [ ] Definir contrato de informação revelável e versão de audiência.
- [ ] Implementar confirmação/revogação com validação de origem no servidor.
- [ ] Montar prévia, confirmação e feedback de alcance.
- [ ] Testar cache, aliases, busca, menções e leitura fora de ordem.

## Critérios de aceite

- [ ] Campo oculto não consta de resposta para audiência não liberada.
- [ ] Concluir sessão/ler capítulo não libera informação fora da regra aprovada.
- [ ] Revogar consentimento bloqueia reativação por revisão antiga.
- [ ] Segredo não aparece por nome alternativo, fallback global ou contexto de IA.

## Validação

- Regras/backend: várias audiências, versões e replay.
- Leitor/portal: capítulos fora de ordem, progresso resetado e atualização ativa.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- D-04 precisa resolver progresso e opção de spoilers; não inventar acesso por cronômetro.
- Parte de leitura se integra à edição na fase 4 e não autoriza publicar rascunho.

## Não escopo

Prometer impedir capturas de tela, revelar automaticamente por IA e tornar coleção privada anônima.
