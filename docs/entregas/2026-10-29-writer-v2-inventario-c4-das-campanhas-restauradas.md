# Writer V2 — Inventário C4 das campanhas restauradas

- Data: 2026-10-29.
- Branch: codex/writer-v2; base e8be4b2.
- Escopo: [plano 226](../tasks/writer-v2/execucao/226-inventario-c4-das-campanhas-restauradas.md).
- Decisão: [ADR 0256](../decisions/0256-campaign-versioned-deletion-inventory.md).
- Estado: validação dirigida e integral positivas; bloco de leitores/cleanup 219–226 fechado localmente.

## Implementado

Inventário privado imutável v1–v4 compartilhado pelo executor e validador C4.
Ordem, filtros, masks, whitelists e limites antigos preservados; versão ausente
permanece 1 e start permanece 4. A máscara do guard dos passos busca somente
dono/schema/marca/deletionId, com identidade nativa, sem prosa da raiz.
A confirmação do usuário mantém seu contrato.

Provas e flags portáteis são campos de documentos já coletados. O
[inventário físico](../tasks/writer-v2/inventario-portabilidade-campanhas.md)
explicita os dados cobertos e os recursos persistentes futuros ainda ausentes.
Não foi criada uma família fictícia de jobs/uploads nem habilitado produtor.

A fixture das variantes foi extraída para helper reutilizável, preservando
os 41 testes existentes. Os cenários novos criam campanha restaurada com
prova por base/item, variante portátil, dois ciclos de adoção, corpo UTF-8 em
geração anterior, outro corpo legado, âncora retida, candidata parcial e
imagem compartilhada. Notas, sessão, vínculo S2, pista e vínculo S3 são
criados pelos serviços reais antes da exclusão.

## Validação dirigida

11 casos novos e 57 regressões passaram: 68/68, zero falhas/skips/cancelamentos,
em 5.143,5513 ms. Log local m149-c4-initial.log no diretório de QA.
Cobertura dirigida: campaignRestoredDeletion, campaignDeletion,
campaignPreparationCleanup, campaignSessionReferencesCleanup e
campaignPortableVariantBody.

Prova revogação antes da coleta, limpeza com origem autorizada/revogada,
retomada após desaparecimento da raiz, remoção física dos dados próprios,
preservação de fontes/outra mesa/outro dono/biblioteca e dois pins restantes.
Retry de cada passo conserva recibo/checkpoint sem duplo decremento.
Provas e codec deliberadamente inválidos não são lidos para autorizar apagar
a cópia própria. Dono de base ou pin divergente falha sem avanço/escrita.
Jobs v1 implícita/explicita, v2, v3 e v4 mantêm seu inventário ao retomar.

Passos ficaram dentro dos orçamentos existentes e não buscaram texto,
sourceEvidence ou codec dos corpos. Não houve leitura de Storage.
ESLint dirigido positivo. A extração inicial deixou um import de teste não
usado, retirado antes da execução final. Produção não foi relaxada.
A revisão automática de permissão teve falhas de capacidade/timeout; ações
não executadas foram conferidas antes da repetição com revisão habilitada.

## Fechamento do bloco

npm run validate terminou com exit 0 sobre o worktree deste incremento.
9.710 testes positivos: 4.978 frontend em 370 arquivos, 94 scripts e
4.638 Functions, sem falhas ou skips nas contagens finais.
O frontend levou 476,02 s; Functions 466.416,8891 ms; scripts 21.042,3511 ms.
Log completo local m149-validate.log no diretório de QA.

Cobertura frontend: 89,71% statements, 85,93% branches, 90,94% functions
e 92,87% lines, com os limites existentes preservados. Skills, arquitetura,
documentação, styleguide, formato e lint global positivos; sintaxe de 451
módulos Functions, typecheck e bundle/smoke positivos. Vite transformou
3.113 módulos e concluiu o bundle em 2,50 s. Avisos de chunks maiores que
500 KiB e imports dinâmicos ineficazes já existiam no log integral anterior;
não foram ocultados nem alterados os limites para passar.

Este resultado cobre os incrementos 219–226 junto à base anterior.
O resultado histórico de f575981 comprova 201–218; não foi reutilizado como
evidência das mudanças atuais. A revisão do diff e o scan dirigido de segredos
não encontraram bloqueios. Após registrar o resultado, formato/documentação
foram reconferidos sem repetir a suíte integral por edição apenas documental.

## Limites e próximo passo

Sem UI/SDK/navegador novos; banco de teste em memória com serviços de domínio
reais. Build/smoke e testes integrais positivos, conforme acima.
P3/D/F2-09 e macro 8/35 continuam abertos. Antes do primeiro produtor
persistente, definir e integrar cancelamento/coleta e reserva dos seus recursos;
depois upload/retomada, remapeamento/materialização/ativação e Estúdio/ciclos.
Somente commits locais, sem agentes/CI/push/PR/merge/deploy.
Servidor manual e checkout master preservados.
