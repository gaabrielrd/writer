# ADR 0170 — âncora metadata do backup de aventura

Status: aceita para incremento interno local; P2 ainda incompleto.
Data: 2026-10-26.

## Decisão

adventureBackupSource oferece leitura interna autorizada da identidade nativa
da raiz e do controle workProgress/current. Token liga domínio, versão, UID e
ID aos createTime/updateTime; não usa datas lógicas como autoridade.
Máscaras são obrigatórias: raiz lê ownerId/schemaVersion/deleting, controle
somente schemaVersion. Controle ausente é distinto de presente; schema futuro
ou port sem getAll falha. Não há escrita, callable, Rule, UI ou grant novo.

Conteúdo próprio continua ancorável se o universo estiver indisponível.
Não reutilizar readCaptureOrigin da campanha, que recusa esse caso, nem copiar
lore global por snapshot. A autorização da origem será conferida separadamente.

## Limite de consistência

Essa é apenas a âncora raiz/progresso. Alteração de persona de cena não atualiza
necessariamente a raiz. Bindings/perfis/cenas/lore/histórico precisam de captura
e provas próprias antes de um selo completo. Não chamar esse token de prova
global da aventura nem habilitar botão que prometa backup integral.

[Plano 147](../tasks/writer-v2/execucao/147-portabilidade-privada-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-fonte-do-backup-de-aventuras.md).
P1 tem validate completo em 3cf8823; esse resultado não certifica código posterior.
