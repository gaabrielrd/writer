# W2-F2-06 — Criar aventuras com estrutura narrativa

**Estado:** Contrato fechado; implementação em subincrementos sequenciais.
**Dependências:** [W2-F2-01](../fase-02-criar-e-preparar/01-projetos-e-navegacao.md), [W2-F2-02](../fase-02-criar-e-preparar/02-planejamento-de-cenas.md)
**Áreas propostas:** editor, lore, image-library; proposta adventures. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Produzir material reutilizável de aventura com preparação, cenas, pistas e instruções para o mestre.

## Entradas e resultado

Entradas: proposta de aventura, partes/cenas, NPCs, locais e materiais autorais. Resultado: aventura privada editável com audiência explícita por bloco/material.

## Escopo e comportamento

- Criar aventura manual e organizar introdução, preparação, cenas/locais, missões, pistas e encerramentos possíveis.
- Usar texto rico e vínculos de lore; instruções de D&D são prosa/modelos, sem motor de regras.
- Separar nota privada do criador, conteúdo do mestre e material para jogador já na origem.
- Reutilizar biblioteca para imagens, mantendo direitos, referências e exclusão no servidor.

## Passos de execução

O [contrato executável F2-06](../execucao/12-aventuras-e-blocos.md) incorpora as
escolhas de 2026-10-15: vários blocos por cena, texto e audiência próprios; novo e
legado sem classificação privados do criador. Os portões locais de F2-05 passaram;
CI acompanha em paralelo conforme a sequência autorizada.

- [ ] Implementar contrato de aventura e tipos de blocos mínimos.
- [ ] Adaptar editor por API pública, preservando seleção, autosave e formatação.
- [ ] Montar organização narrativa e referências de NPC/local/pista.
- [ ] Verificar revisões e prévia por audiência sem publicação automática.

## Critérios de aceite

- [ ] Mestre prepara uma aventura original sem simular o domínio com um livro.
- [ ] Bloco secreto mantém audiência correta ao mover/duplicar.
- [ ] NPC pode reutilizar lore existente sem copiar toda ficha.
- [ ] Criação manual funciona sem IA, saldo ou compra.

## Validação

- Componentes: estrutura, referências, cancelamento e autoria.
- Regras/E2E: audiências, biblioteca, tema, teclado e aventura com várias partes.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Rótulo de audiência não equivale ainda a portal; fase 3 implementa projeções.
- D-10 controla eventual conteúdo SRD; modelos não devem embutir material não autorizado.

## Não escopo

Gerar livro oficial de regras, balanceamento de combate e importar mapas automaticamente.
