# Writer V2 — retirada segura de imagens restauradas

Data: 2026-10-28. Base: 6ceacdc.
[Plano 181](../tasks/writer-v2/execucao/181-retirada-segura-de-imagens-restauradas.md)
e [ADR 0203](../decisions/0203-restored-image-retirement-fence.md).

## Implementado

Exclusão de imagem restaurada substitui o arquivo por marcador vazio privado
permanente antes de encerrar o registro da biblioteca. O upload duplicado retido
agora recebe conflito e não recria bytes. O adaptador retira somente a geração
comprovada, incluindo sua transição ativa conhecida; bucket versionado perde
apenas o payload original, com geração/metageração exatas.

Contexto e provas vêm da biblioteca, sem confiar em paths/gerações do pedido.
Claim deleting exige ausência de usos; finalize deleted confere nascimento e
conteúdo originais. Falhas externas/Firestore retomam com o marcador preservado;
registro recriado durante I/O não é sobrescrito. Imagens geradas/legadas sem
origem de restauração conservam exclusão anterior. Sem Rules, dependência ou
endpoint novo; ligação do adaptador em index.mjs.

## Evidência dirigida

23 casos novos distintos: 13 do Storage, incluindo dois usando SDK GCS real
contra HTTP local, e dez do serviço de biblioteca. Cobrem corrida de upload após
aceitar/excluir, prepared/active/ausente, ACK perdido, PATCH atrasado sobre versão
antiga, CAS de DELETE, dados estrangeiros/recriados, erro de prova, marcadores,
gerações além de Number.MAX_SAFE_INTEGER, concorrência/rollback, adaptador ausente,
usos inconsistentes, origem inválida e caminho de imagens legadas/geradas.

Seleção final com os 23 novos e 26 regressões de mídia passou: 49/49 Node em
15.284,988 ms. Mais 23 regressões dos adaptadores anteriores passaram na seleção
precedente. Essa seleção inicial teve 61/62 positivos: o único caso reprovado
ainda usava adaptador só com remove; atualizado para usar retire real, manteve
a recusa de tombstone recriado e passou isoladamente e na seleção final.
Nenhuma assertiva de segurança ou limite de teste foi relaxado.

Primeiro teste de caminho ausente reutilizava artificialmente geração de outro
bucket double que reiniciava a sequência. A fixture passou a representar remoção
real da geração no mesmo bucket, sem mudar a exigência da implementação.

O teste SDK Firestore existente foi ampliado e passou em 144.846,881 ms no demo
local 1.22.0. Exercitou a finalização real do livro e sua imagem, retirada por
marcador privado sem token, preservação do nascimento original da biblioteca e
recusa do registro recriado durante I/O. Também conservou os testes de Rules,
recibos e histórico de ativação. JVM dedicada encerrada no finally; ausência dos
processos reconferida após o terminal zero.

## Checks e limites

Formatação, ESLint/sintaxe dos arquivos alterados e docs/arquitetura/styleguide
dirigidos passaram. Revisão final sem bloqueador: o servidor escolhe a nova
operação pelas provas da biblioteca, sem alterar endpoints ou permissões;
marcadores não são apagados e dados sem prova são preservados. Commit local
com hooks normais e conferência dos bytes antes/depois.
A suíte integral fica para fechamento do bloco de mídia; validate de 179 é
baseline anterior, não gate do código novo.

Sem CI/push/PR/merge/deploy/agentes. A prova local não é implantação ou teste
em bucket de produção. Marcadores vazios permanentes são intencionais.
Órfãos anteriores de geração desconhecida não são adotados retroativamente.

Ainda faltam materialização Storage de aventuras com intenção durável/Sharp/
fence de cancelamento, biblioteca/usos/ativação, agregados/audit, recuperação
cifrada/UI/roundtrip e P3/D/F2-09/fases seguintes. Gates humanos/comerciais
permanecem; macro 8/35 não muda.
