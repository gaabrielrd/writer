# W2-F3-03 — Avaliar sugestões e pendências de revisão

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F3-02](../fase-03-compartilhar-e-usar/02-revisao-editorial.md)
**Áreas propostas:** editor, books; propostas editorial e adventures; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Transformar feedback em trabalho editorial controlado, preservando a decisão final do autor.

## Entradas e resultado

Entradas: comentário/sugestão, revisão de base e ação do proprietário. Resultado: sugestão aceita, rejeitada ou marcada para revisão, com resultado rastreável.

## Escopo e comportamento

- Propor substituição de trecho sobre a versão revisada e manter texto sugerido separado.
- Permitir criar pendência editorial, prioridade/estado e ligação à cena.
- Aplicação pelo dono verifica revisão/trecho, serializa com autosave e preserva versão anterior.
- Sugestão humana não debita IA; aceite/rejeição repetido não duplica mudanças.

## Passos de execução

- [ ] Especificar estados de sugestão e pendência.
- [ ] Implementar validação e aceite seguro no servidor/ponte do editor.
- [ ] Montar comparação e fila de revisão.
- [ ] Testar conflito, restauração e aplicação cancelada.

## Critérios de aceite

- [ ] Revisor não aplica sua própria sugestão no manuscrito.
- [ ] Se o trecho mudou, a aplicação é bloqueada com comparação disponível.
- [ ] Rejeitar preserva manuscrito e histórico do feedback.
- [ ] Aceitar uma vez altera somente trecho autorizado e não debita créditos.

## Validação

- Editor/backend: autosave concorrente, dupla aplicação e trecho ausente.
- Componentes: comparar, rejeitar, resolver pendência e permissões.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Reaproveitar protocolo de IA sem herdar cobrança humana indevida.
- Definir se pendência e comentário podem ser removidos após fechar a rodada.

## Não escopo

Aceite automático, análise por IA nova e contabilidade de crédito para feedback humano.
