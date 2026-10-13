# W2-F1-02 — Definir domínio, cânone e compatibilidade de dados

**Estado:** Planejada; execução não iniciada.
**Dependências:** [W2-F1-01](../fase-01-direcao-e-fundamentos/01-jornadas-e-escopo.md)
**Áreas propostas:** books, universes, lore; propostas adventures, campaigns e publications. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Projetar dados que permitam reutilizar um universo sem propagar automaticamente as consequências de uma mesa para outros projetos.

## Entradas e resultado

Entradas: livros, lore e revisões existentes; exemplos das jornadas. Resultado: contratos de entidades, vínculos, versões, ciclo de vida e migração.

## Escopo e comportamento

- Definir identidade e autoria de cenas, aventuras, campanhas, sessões, edições e variantes.
- Preservar IDs, atos, ordem de capítulos e lore local de livros legados; projeto independente continua possível.
- Comparar vínculo vivo, edição congelada e variante particular; estabelecer a promoção explícita de cânone.
- Definir limites de texto/arquivos, paginação, exclusão, desvinculação, retenção e conflitos de revisão a partir de medições.

## Passos de execução

- [ ] Ler modelos e serviços atuais pelo grafo e confirmar o código correspondente.
- [ ] Desenhar exemplos de um livro e duas campanhas no mesmo universo.
- [ ] Especificar contratos e migrações reversíveis ou recuperação por backup.
- [ ] Fechar D-01 e D-02 e registrar uma proposta de ADR.

## Critérios de aceite

- [ ] Editar uma campanha não muda o original nem a segunda campanha.
- [ ] Livro antigo permanece acessível sem conversão destrutiva.
- [ ] Cada entidade tem proprietário, revisão, origem e comportamento de exclusão definido.
- [ ] Limites medidos e conflito concorrente têm resposta explícita; não há array ilimitado em um documento.

## Validação

- Revisão de contrato com dados legados, entidades removidas e troca de universo.
- Simular publicação antiga, atualização de origem e consequências particulares em diagramas/tabelas.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Criar abstração genérica que force migração de todas as features; preferir domínios demonstrados.
- D-07 influencia edições adquiridas e precisa convergir com W2-F1-04.

## Não escopo

Migração de produção, transferência automática de autoria e ramificações narrativas avançadas.
