# ADR 0193 — Consumo autenticado e remapeamento de aventuras

Data: 2026-10-27. Status: aceita para contrato interno.
Base: planos 170/171 e ADR 0192.

## Decisão

createVerifiedAdventureRestoreContent reconstitui o relatório final do estado
autenticado e compara fonte, summary e reportHash antes de disponibilizar leituras.
Autentica cada item por ordinal/contexto/operação/nascimento/hash e relê seu JSON
pelas posições/SHA aprovados. Não varre todos os itens ao abrir a factory:
cada unidade é conferida quando consumida.

Todo resultado traz verify(tx). O consumidor deve aguardá-lo na mesma transação,
antes das escritas, para reconferir job/snapshot/item e provas dos chunks observados.
Uma verificação anterior à transação não substitui essa barreira. JSON e metadata
projetados são imutáveis; bytes mutáveis são reconferidos antes da verificação.

Corpos de histórico, draft e imagem são lidos um frame por passo, com payload
máximo de 64 KiB e framing limitado a 80 KiB por range. Prefixo SHA/UTF-8,
contagens, bytes, layout e sourceToken são conferidos. Só o último passo, após
SHA integral, produz raw-content-complete; os anteriores são raw-part-only.
PNG tem assinatura/manifesto conferidos, não decodificação de pixels.

Checkpoints raw são exclusivamente de host confiável. O futuro stager precisa
persistir e autenticar cada prefixo pelo próprio estado/recibo privado antes de
reutilizá-lo. Não aceitar checkpoint ou sourceToken do cliente como credencial.
Um sourceToken vincula evidência de leitura, sem conceder acesso ou escrita.

## Projeção de identidade

createAdventureRestoreRemapper é puro e separa origem/destino/job/tipo/parent.
Os IDs nativos cabem no limite de 80 caracteres, com domínio próprio de aventura.
Partes/cenas/blocos, 17 famílias de recurso, lore/relações, personas e versões
mantêm referências internas coerentes. Chaves nativas de ordem/referência/link
são recalculadas. Referências externas e origem de universo permanecem para a
autorização posterior, sem duplicação ou grant.

Imagens são remapeadas por asset/uso; cena e bloco que usavam a mesma biblioteca
recebem cópias distintas, coerentes entre head/binding/manifesto/raw.
O retorno identity-projection-only não é um backup novo validado. Manifestos
de contagem/selo e universo são sourceOnly. Hashes de cabeçalho/current permanecem
como sourceBindings; o stager deve reconstruir as provas nativas do destino.
IDs portáteis de assets na projeção são chaves internas do restauro, não um selo
recalculado para exportação. Uma futura captura recalcula seus próprios endereços.

Não criar heads para recursos presentes apenas no histórico. Draft continua
destinado a versão separada; mapear sua identidade não substitui o texto salvo.

## Consequências

Nenhuma escrita de produção, endpoint, permissão, ativação, Storage/biblioteca
ou UI foi adicionada. Restauração utilizável exige os próximos stagers, acesso
atual às origens, recuperação cifrada, revisão e roundtrip. A prova por etapas
não promete snapshot atômico contra alterações administrativas externas.
