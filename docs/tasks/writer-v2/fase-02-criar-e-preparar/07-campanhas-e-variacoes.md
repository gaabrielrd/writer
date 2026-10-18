# W2-F2-07 — Instanciar campanhas e variantes particulares

**Estado:** Em execução; gestão A concluída em 624c912, captura B em f97455d e notas C1 em bda5e70, com CI verde. Variantes C2 validadas localmente em 2026-10-17, CI pendente; comparação/atualização e exclusão integral pendentes.
**Dependências:** [W2-F2-06](../fase-02-criar-e-preparar/06-aventuras-e-estrutura-narrativa.md), [W2-F1-03](../fase-01-direcao-e-fundamentos/03-permissoes-e-privacidade.md)
**Áreas propostas:** universes, lore; propostas adventures e campaigns; functions. Nomes novos são propostas, sujeitos à fase 1.

## Contexto e objetivo

Executar a mesma aventura em campanhas independentes, preservando original, autoria e universo.

## Entradas e resultado

Entradas: aventura própria/edição autorizada, nome da campanha e universo opcional. Resultado: campanha com origem identificada e estado particular.

## Escopo e comportamento

- Criar campanha independente ou a partir de origem própria; edição adquirida entra em W2-F4-12.
- Aplicar contrato de snapshot/vínculo/variante D-02 e indicar versão de origem.
- Distinguir informação canônica de mudança da mesa; trocar vínculo não apaga notas locais.
- Arquivar campanha preserva sessões conforme retenção; exclusão é explícita e idempotente.

## Passos de execução

O [contrato executável](../execucao/14-campanhas-e-variantes.md) separa a gestão
das campanhas independentes da captura de uma origem. O subincremento A permite
editar título/descrição/estado e vínculo organizacional com universo próprio,
preservando checklist e procedência. Não comprova instâncias de uma aventura,
variantes, comparação de origem ou exclusão integral. O
[subincremento B](../execucao/15-captura-de-aventura.md) captura a aventura própria
completa e somente lore explicitamente referenciado, com preparação retomável e
leitor privado da base congelada; não encerra os critérios globais desta tarefa.

- [ ] Implementar origem e contrato de sobreposição particular.
- [ ] Criar/arquivar/desvincular no servidor com autorização.
- [ ] Montar consulta de lore distinguindo base e variante.
- [ ] Verificar atualizações da origem e conteúdo removido.

## Critérios de aceite

- [ ] Duas campanhas da mesma aventura não compartilham consequências automaticamente.
- [ ] Trocar/desvincular universo preserva conteúdo local.
- [ ] Falha e retry não duplicam campanha.
- [ ] Criador de aventura não recebe notas da mesa só por ser autor do original.

## Validação

- Modelo/backend: duas instâncias, origem indisponível e retry.
- Regras: mestre, dono do universo, estranho e criador da aventura.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Atualizações da origem devem seguir D-02/D-07, sem substituição automática.
- Participação ainda é planejada; convites reais entram na fase 3.

## Não escopo

Promover cânone automaticamente, copiar original privado de terceiros e instanciar compra sem direito confirmado.
