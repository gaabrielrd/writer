# W2-F2-07 — Instanciar campanhas e variantes particulares

**Estado:** gestão A concluída em 624c912, captura B em f97455d e notas C1 em bda5e70, com CI verde. Variantes C2 e comparação C3A concluídas tecnicamente em fe10b15; adoção C3B concluída em 947cfc3, com CI/regras verdes. Exclusão integral C4 e F2-07 concluídas tecnicamente em `0006a66`, com CI/regras verdes. Ver [entrega C4](../../../entregas/2026-10-18-writer-v2-exclusao-de-campanhas.md).
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

- [x] Implementar origem e contrato de sobreposição particular.
- [x] Criar/arquivar/desvincular no servidor com autorização.
- [x] Montar consulta de lore distinguindo base e variante.
- [x] Verificar atualizações da origem e conteúdo removido.

## Critérios de aceite

- [x] Duas campanhas da mesma aventura não compartilham consequências automaticamente.
- [x] Trocar/desvincular universo preserva conteúdo local.
- [x] Falha e retry não duplicam campanha.
- [x] Criador de aventura não recebe notas da mesa só por ser autor do original.

Aceites locais referem-se ao recorte atual de origens próprias e isolamento por
UID. Variantes/notas comprovam alterações particulares independentes; consequências
estruturadas, participação e criação a partir de edição adquirida permanecem nas
fases próprias. A CI de C4 em `0006a66` encerrou tecnicamente o recorte de F2-07.

## Validação

- Modelo/backend: duas instâncias, origem indisponível e retry.
- Regras: mestre, dono do universo, estranho e criador da aventura.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- Atualizações da origem devem seguir D-02/D-07, sem substituição automática.
- Participação ainda é planejada; convites reais entram na fase 3.

## Não escopo

Promover cânone automaticamente, copiar original privado de terceiros e instanciar compra sem direito confirmado.
