# W2-F2-09 — Integrar lore, importação e portabilidade

**Estado em 2026-10-21:** L concluído tecnicamente em `087bced`, com CI geral/regras
verdes, sob [contrato fechado](../execucao/26-lore-proprio-de-aventura.md). Falhas e
correções estão preservadas na [entrega L](../../../entregas/2026-10-21-writer-v2-lore-proprio-de-aventura.md).
I concluído tecnicamente em ffc01d9, com CI/regras verdes; IA está implementada e validada
localmente, com CI pendente, no [plano A](../execucao/29-contexto-autorizado-e-ia-de-cenas.md).
Portabilidade continua planejada.
A [sequência executável](../execucao/25-lore-importacao-e-portabilidade.md) separa
lore próprio de aventura, importação, IA, portabilidade de livro/aventura/campanha
e demonstração integrada. O operador confirmou backup do estado atual e de todo
o histórico, incluindo versões manuais e cópias anteriores às restaurações.
A importação tem [plano próprio liberado](../execucao/27-importacao-revisada-de-aventura.md),
incluindo a decisão de preservar a revisão confirmada protegida no dispositivo,
sem PDF. A [entrega I](../../../entregas/2026-10-21-writer-v2-importacao-revisada-de-aventura.md)
registra fechamento local e remoto verde.
**Dependências:** [W2-F2-05](../fase-02-criar-e-preparar/05-historico-e-restauracao.md), [W2-F2-06](../fase-02-criar-e-preparar/06-aventuras-e-estrutura-narrativa.md), [W2-F2-07](../fase-02-criar-e-preparar/07-campanhas-e-variacoes.md), [W2-F2-08](../fase-02-criar-e-preparar/08-preparacao-de-sessoes.md)
**Áreas envolvidas:** books, editor, lore, universes, ai-assistant, scenes, adventures,
adventure-blocks, campaigns e seus serviços de captura, variantes e sessões.

## Contexto e objetivo

Conectar novos projetos às capacidades existentes e permitir saída privada dos dados sem perda de contexto.

## Entradas e resultado

Entradas: manuscritos/importações, lore, personas e dados de campanha. Resultado: vínculos coerentes e exportações privadas claramente separadas das públicas.

## Escopo e comportamento

- Reutilizar revisão de importação existente; adaptar prosa importada para aventura apenas após confirmação.
- Preservar menções, prioridade local/global e referências em mudanças de projeto.
- Contexto de IA recebe somente recursos que a pessoa pode ler; não inserir dados de jogadores no contexto de outro usuário.
- Definir backup privado versionado de aventura/campanha e restaurabilidade, sem chaves, pedidos ou credenciais.
- Na restauração de livro, religar ao universo original somente com acesso atual,
  sem duplicar ou sobrescrever universo/lore global. Sem acesso, revisar os próprios
  sem vínculo e conservar referências externas indisponíveis; nunca convertê-las
  em fichas locais. Decisão de 2026-10-21, detalhada no [plano P1](../execucao/31-portabilidade-de-livros.md).

## Passos de execução

- [x] Conferir o plano de importação PDF existente e reusar contratos de blocos (I concluído em ffc01d9; CI/regras verdes).
- [x] Integrar menções/lore/IA por interfaces públicas (L e A validados localmente; CI A pendente).
- [ ] Implementar portabilidade dos novos campos e testar versões antigas.
- [ ] Executar demonstração de conto e aventura no mesmo universo.

## Critérios de aceite

- [x] Importação não publica nem concede direito de revenda (I, sem habilitação comercial).
- [x] Menção de entidade particular prevalece conforme regra aprovada e não revela segredo por fallback (provas L/A).
- [ ] Backup mantém sessões, origem e consequências; não é arquivo de venda.
- [ ] Livros legados, exportações e créditos de IA mantêm comportamento atual.

## Validação

- Regressão: importação DOCX/PDF/Markdown e exportação de livros com atos.
- IA/regras: contexto por autorização; roundtrip do formato privado e referência removida.

Aplicar também o [contrato transversal de validação](../validacao-e-aceite.md) e registrar evidência real.

## Riscos e decisões necessárias

- O grafo pode não refletir branches de importação paralelas; confirmar integração no checkout antes de implementar.
- Dados estruturados de participantes futuros precisam de política D-09; isso não
  bloqueia o lore privado atual e não autoriza importar participantes ou grants.
- O exportador atual é somente de livro e não tem restauração; os novos formatos
  precisam comprovar roundtrip, compatibilidade e autorização vigente da origem.

## Não escopo

OCR, autorizar venda de PDF importado, exportar chaves BYOK e substituir o pacote comercial por backup JSON.
