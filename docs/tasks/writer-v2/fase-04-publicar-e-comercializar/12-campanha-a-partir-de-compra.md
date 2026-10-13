# W2-F4-12 — Iniciar campanha a partir de aventura adquirida

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F4-09](../fase-04-publicar-e-comercializar/09-biblioteca-e-entrega.md), [W2-F2-07](../fase-02-criar-e-preparar/07-campanhas-e-variacoes.md), [W2-F4-10](../fase-04-publicar-e-comercializar/10-reembolsos-e-disputas.md)
**Áreas propostas:** propostas campaigns, adventures, library e commerce; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Fechar o ciclo comercial de aventura permitindo ao comprador utilizá-la em uma campanha própria.

## Entradas e resultado

Entradas: direito confirmado, edição de aventura e nome da campanha. Resultado: instância particular com origem, licença e materiais autorizados.

## Escopo e comportamento

- Validar acesso/edição no servidor e instanciar campanha de modo idempotente.
- Preservar original e impedir que criador da aventura leia notas do comprador.
- Manter separação mestre/jogador ao reutilizar materiais; participação não dá ao jogador licença para baixar pacote completo.
- Atualização, refund e retirada seguem D-07 sem substituição de sessões/notas locais.

## Passos de execução

- [ ] Integrar biblioteca com ação Iniciar campanha.
- [ ] Aplicar contrato de origem e licença da edição comprada.
- [ ] Montar seleção de materiais e preparação da primeira sessão.
- [ ] Testar duas mesas, repetição, acesso revogado e edição atualizada.

## Critérios de aceite

- [ ] Comprador inicia campanha e prepara sessão sem editar o produto original.
- [ ] Duas instâncias têm consequências independentes.
- [ ] Jogador recebe somente materiais liberados pelo mestre.
- [ ] Comportamento após reembolso/retirada corresponde à política aprovada e informa impacto.

## Validação

- Backend/regras: direito inexistente, expirado/revogado e retry.
- E2E: adquirir aventura, criar campanha, convidar jogador e conduzir sessão.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Não copiar licença do pacote como autorização de revenda.
- Instanciação não pode perder conteúdo se a origem muda durante preparação.

## Não escopo

Revenda de cópia, edição do universo do vendedor e atualização automática de campanha sem revisão.
