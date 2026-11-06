# ADR 0292 — topologia histórica de impacto com reautorização nativa

- Estado: implementada localmente; testes preparados sem execução.
- Data: 2026-11-03.

## Contexto

O mapa distingue pedido próprio, inventário, topologia, propagação e fatos técnicos.
Seus derivados exigem escopo/fence atuais. Copiar o estado bruto levaria provas,
cursores e grants para o arquivo; usar o motor durante o backup poderia alterar
estado ou continuar trabalho. Testemunhos de propagação não são citações de prosa.

## Decisão

Compartilhar inspectLiteraryImpactCurrent, equivalente ao gate nativo existente e
sem mutação. Conferir UID/origem do controle antes de intent/census, e reautorizar
registro/escopo/grafo antes de derivados. Preservar controle e contagens históricas
separados de resultados indisponíveis. Não copiar labels ou corpos.

Projetar nós, vínculos, visitas e testemunhos em documentos conectados por IDs
arquivísticos sob a encarnação original do mapa. Conferir presença/chave dos
destinos; ausências ficam indisponíveis. Manter origem da propagação e relação
nativa sem transformar metadados técnicos em evidência literária. Verificações
viram relatórios registered-dependencies e decisões próprias continuam separadas.

## Consequências

37 famílias internas, até dois artefatos/1 MiB por bundle, partes64KiB. Nenhum
produtor, endpoint, restauração v2, débito ou execução habilitado. Quatorze casos
preparados, nenhum executado. Composição completa, restauração útil e fechamento
das cinco etapas seguem pendentes. Ver o
[incremento 44](../tasks/producao-literaria/44-captura-do-mapa-de-impacto.md).
