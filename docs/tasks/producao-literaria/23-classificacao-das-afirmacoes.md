# Incremento 23 — Classificação estruturada das afirmações de lore

## Estado

Implementado em código; testes preparados e não executados neste turno. O anterior foi
progresso (guia editorial comum na análise de lore). O objetivo integral permanece ativo,
sem conclusão formal de E3 ou das cinco etapas.

## Contrato de afirmações

A entidade detectada pode incluir claims v1 com até 16 afirmações relevantes. Cada item
informa campo summary/details, trecho exato do campo sugerido, tipo observed,
interpretation ou proposal, evidência literal contínua do texto e justificativa.
Interpretação e proposta exigem justificativa não vazia. Duplicatas, campos/tipos extras,
texto não pertencente ao campo e evidência ausente são recusados.

O protocolo puro é o mesmo no servidor e no parser BYOK. Também centraliza a resolução
de evidência, preservando o trecho original e tolerando apenas diferenças de whitespace.
Ausência de claims preserva a forma legada, sem inventar observação ou certeza.
A instrução compartilhada pede a estrutura, preservando o alcance de fala, crença e
intenção. A classificação é sugerida pela IA, não certificação semântica do servidor.

## Revisão do autor

O diálogo mostra os tipos de afirmações e permite inspecionar texto, campo, evidência
e justificativa. Nenhuma sugestão vem selecionada, inclusive resultados antigos sem
classificação. Trocar o destino também limpa a seleção. Editar os próprios campos
marca a classificação como pertencente à sugestão original; o autor confere sua
correspondência com o texto atual antes de aplicar.

A aplicação continua sendo ação explícita do autor sobre os campos escolhidos. Claims
não concede acesso nem é copiado para os campos públicos/canônicos das fichas. Mantém-se
no resultado privado da análise com suas evidências. Não foi acrescentada uma promessa
de arquivo permanente: a retenção/expiração do ticket existente permanece e deve entrar
na auditoria de portabilidade/proveniência de E5 antes de afirmar preservação histórica.

A evidência literal não prova a verdade de uma inferência. A estrutura não declara
cobertura integral da ficha, nem resolve identidade por nome. Ambiguidades de entidades
homônimas ainda exigem revisão no fluxo e auditoria dos mecanismos de consolidação.

## Arquivos e limites

Novo loreClaimProtocol.mjs puro/browser-safe e sua declaração. Usado por
validateDetectedLore e parseDetectedLore; tipo opcional exportado pela API pública de
lore. Instrução de análise compartilhada ampliada; diálogo com revisão explícita.
Sem nova coleção, callable, Function, dependência, preço ou campo no payload nativo de
lore. Continua o registro de 436 ações em 16 setores.

## Testes preparados

- Quatro casos de servidor/puro: tipos distintos por campo, legado, esquema/evidência/
  justificativa inválidos e preservação do whitespace original.
- Um caso no parser frontend preserva interpretação e recusa evidência inexistente.
- Dois casos no diálogo: interpretação exige seleção explícita; legado não é promovido
  silenciosamente. Testes antigos passam a representar a ação explícita de seleção,
  inclusive depois de mudar destino. Eles ainda não foram executados.

Uma edição parou em assert de âncora antes de gravar o diálogo; o trecho atual foi lido
e a mudança reaplicada. Não houve alteração parcial desse arquivo na tentativa falha.
Nenhum teste, tipo, lint, formato, build, navegador ou cobertura foi executado no turno.

## Pendências do objetivo integral

Auditar E1–E4 requisito a requisito e validar todas as entradas de IA, contexto e
concorrência. Implementar E5: inventário completo e visão de impacto; portabilidade
editorial .writer como nova cópia privada, com remapeamento, origem e fontes externas
indisponíveis, sem restaurar credenciais/grants/execuções. Considerar a retenção dos
resultados classificados nessa auditoria, sem tratar ticket temporário como histórico.

Antes dos testes finais, conferir/incorporar a principal conforme solicitado, congelar
o snapshot e cumprir os gates, incluindo cobertura de funções >=90%. Última base
incorporada identificada: 16d8af5. Sem commit literário, merge de volta, push ou deploy.
