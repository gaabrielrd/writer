# P1 — finalização recuperável da capa restaurada

## Objetivo e sequência

Concluir o passo 4 do [plano 133](133-revisao-e-ativacao-do-livro.md), após a
ativação privada. Não tratar Firestore/Storage como transação distribuída.
Host/limpeza/roundtrip integral e fechamento de P1 continuam no objetivo.

Grafo consultado primeiro; símbolos recentes não indexados e snippet do serviço
de imagens com faixa antiga. Código atual confirma imagem preparing/url null,
uso nativo e arquivo accepted false; detach/exclusão normal preservam biblioteca.

## Contrato antes da implementação

1. Adaptador Storage aceita somente contexto original e prova de geração/
   metageração preparada. PATCH de metadata com ambas as precondições e geração
   decimal exata; não regravar bytes. Marcar active/accepted true com um token de
   download novo e origem da metageração preparada. Verificar metadata resultante.
   Recuperar resposta perdida pelo mesmo estado/prova, sem trocar token. Recusar
   estrangeiro, fence, geração recriada ou metadata alterada. Caminho fixo.
2. Serviço interno finalizeBookRestoreMedia por restoreId/jobToken/operationId,
   sem incrementar checkpoint do job terminal. Exigir prova de ativação original
   e definições/intenção nativas. Imagem deve ter nascido no commit de ativação,
   com origem/caminho/prova originais e estado preparing. Uso e contador precisam
   ser consistentes; nenhum uso estrangeiro pode ser adotado.
3. Autorizar antes do PATCH e reautorizar após await externo. Tornar imagem
   ativa/URL e, se aplicável, URL da raiz em uma transação Firestore própria.
   Não mudar contador/uso. Atualizar raiz somente com nascimento/origem/dono
   originais, não em exclusão e ainda ligada à mesma capa/URL pendente. Livro
   excluído, recriado ou que trocou a capa não é reconstituído/sobrescrito; imagem
   própria continua recuperável na biblioteca. Respeitar remoção concorrente da
   imagem; não recriar arquivo ausente ou documento em exclusão.
4. Persistir conclusão imutável sob activationMedia/current e recibos separados
   em bookRestoreMediaOperations. Job/recibo/reserva de ativação não mudam.
   Sem capa: conclusão none sem I/O Storage. Recibos só contêm metadata, sem URL,
   token de download, chaves ou prosa. Confirmar respostas perdidas sem reaplicar
   efeitos. Nova operação após conclusão retorna already-complete com a conclusão
   original, sem criar recibo ou escrever a imagem outra vez.
5. getBookRestoreMediaState retorna conclusão histórica e disponibilidade atual
   do registro original na biblioteca, sem URLs/grants. Imagem apagada/recriada
   não é readotada por recibo antigo. Consulta da ativação permanece válida.

## Validação dirigida

Node do adaptador e serviço: bytes/gerações exatos, replay/resposta perdida,
falhas antes/depois do PATCH/commit, concorrência, órfãos/ABA/fence/estrangeiros,
imagem apagada ou em exclusão, mudança de capa/raiz, conta/entrada/operação
conflitantes, sem capa e prova/recibo/job imutáveis. API normal da biblioteca e
backup deve conseguir usar a imagem após concluir.

SDK GCS real contra contrato HTTP loopback para PATCH/precondições/precisão.
SDK Firestore/Rules real para commit da imagem/raiz/conclusão/recibo e retomada.
Não usar bucket, Auth ou conteúdo de produção. Nenhum endpoint novo até host.

## Aceites

- [x] PATCH condicional recuperável, bytes intactos e token estável.
- [x] Conclusão da imagem/URL nativas com autorização antes/depois do I/O.
- [x] Exclusão/troca/recriação da raiz preservadas; sem restaurar grant antigo.
- [x] Conclusão/recibos sem URL; job e prova de ativação intactos.
- [x] Node/SDK/checks dirigidos, documentação e commit local.
- [ ] Próximos: limpeza própria, host/UI/roundtrip e fechamento de P1/fases/gates.

Sem CI/push/PR/merge/deploy/subagentes. Validate global no fechamento de P1.

## Estado implementado

Conclusão histórica e imageState atual são separados; preparing não equivale a
available, e remoção/recriação resulta unavailable sem URL por replay. Ao remover
imagem durante a finalização, o serviço recusa concluir e preserva o estado atual.
47 Node distintos e um SDK Firestore positivos; cinco GCS/HTTP já incluídos nos
Node. Correções/limites na
[evidência](../../../entregas/2026-10-25-writer-v2-finalizacao-da-capa-restaurada.md).
Limpeza própria/host/UI/roundtrip e demais P1/V2/fases/gates permanecem obrigatórios.
