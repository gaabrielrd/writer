# Writer V2 — âncora privada da portabilidade de campanhas

- Data: 2026-10-29.
- Base: 25eb87f; branch codex/writer-v2.
- Escopo: primeiro incremento do [plano 201](../tasks/writer-v2/execucao/201-portabilidade-privada-de-campanhas.md).
- Estado: evidência parcial de desenvolvimento; não é fechamento de P3.

## Resultado

Foi preparado o serviço interno que detecta alteração da raiz e de cinco
controles globais da campanha, sem ler prosa ou criar dados. A conferência
exige conta/dono, encarnação nativa e ausência da reserva de exclusão C4.
Notas, sessões, pistas e checklist alterados pelos escritores reais invalidam
a âncora. Conferir próprios continua possível quando a aventura original some.

O plano registra o inventário atual de C1/S1/S2/S3, preparação, base, mídia,
variantes/legadas, controles de adoção, autorização e C4. A decisão está na
[ADR 0231](../decisions/0231-campaign-backup-private-source-anchor.md).

## Critérios deste incremento

- [x] Entrada fechada, UID/IDs/hash estritos e valores congelados antes de await.
- [x] Apenas máscaras fixas; sem queries, escrita, prosa, chave ou leitura da origem.
- [x] Resposta mínima estável; controles ausentes permanecem ausentes.
- [x] Relógios nativos, recriação e escopo antigo invalidados; C4 bloqueia antes da raiz.
- [x] Escritores reais alteram a âncora; vínculo por sessão demonstra limite separado.
- [x] Campanha real capturada continua conferível após remover sua aventura na fixture.
- [ ] Captura completa, procedência verificável, arquivo, restauração, UI e ciclo P3.
- [ ] Validate integral do novo bloco; será executado no fechamento, sem CI.

## Arquivos

- functions/src/campaignBackupSource.mjs: conferência privada da raiz/controles.
- functions/test/campaignBackupSource.test.mjs: 18 percursos direcionados.
- Plano 201, ADR 0231, índices de execução e este registro.
- Arquitetura e progresso: limites da âncora e continuidade P3.

Não houve alteração de contrato público, Rules, índice de Functions, dependência,
lockfile, chave, armazenamento ou inventário C4.

## Validação observada

O comando node --test functions/test/campaignBackupSource.test.mjs terminou
com exit 0: **18 testes, 18 positivos, zero falha/cancelado/ignorado/todo**,
173,8213 ms. Banco simulado usa nascimento/updateTime; consumidores e escritores
são os módulos reais. A porta somente leitura proíbe get completo, queries e
qualquer mutação durante a conferência.

A primeira tentativa no sandbox foi bloqueada por spawn EPERM. A execução
direcionada com permissão de processo passou. Duas fixtures iniciais precisaram
correção: nanos eram adicionados aos 10/20 ms do relógio de teste, e a comparação
de timestamps incluía funções distintas. Nenhum desses ajustes alterou o serviço
de produção ou enfraqueceu a validação de timestamps.

Lint e sintaxe dos dois arquivos novos, formato dos oito arquivos, links da
documentação e git diff --check passaram, todos com exit 0. Revisão final sem
bloqueadores: escopo somente leitura, nenhum segredo/endpoint/armazenamento novo.
Servidor manual respondeu HTTP 200, mesmo PID 11192; master permaneceu limpa.
Não se reutiliza a suíte verde anterior como validação do código novo.
O validate integral de P2 está na
[evidência anterior](2026-10-29-writer-v2-validacao-integral-das-aventuras.md).

## Pendências e limites

Vínculos por sessão e mudanças de recurso exigem inventário/provas adicionais:
o teste do escritor S3 demonstra que a âncora, isoladamente, não certifica essas
alterações. Tampouco reautoriza origem/base ou comprova procedência portátil.

Não há exportação/restauração de campanhas utilizável na interface ainda.
P3/D/F2-09, a política final de perguntas do plano 199 e os gates humanos/
comerciais continuam abertos. Macro **8/35** inalterada. Não houve CI, envio
remoto, PR, merge, deploy ou reinício do servidor manual da porta 5173.
