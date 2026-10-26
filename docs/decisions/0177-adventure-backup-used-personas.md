# ADR 0177 — personas usadas pela aventura no backup

Status: aceita para incremento interno local; P2 incompleto.
Data: 2026-10-26.

## Decisão

Leitor específico de vínculos adventure/scene, com raiz singleton e cenas
paginadas por metadata. Blocos herdam cena; não criam configuração separada.
Vínculo exige conta/schema/flags válidos e recebe prova nativa própria: setter
de cena não muda raiz. Fonte 147, IDs/tokens/índice capturados antes de awaits.

Persona null não inventa perfil nem consulta biblioteca. Preset usa definição
pura/hash; demais IDs válidos são consultados somente no namespace da conta
por readAvailablePersonaMetadata. Aceitar IDs privados legados sem prefixo
custom-, como o resolver nativo. Não listar biblioteca ou buscar coincidências.
Perfil declarado ausente/indisponível falha; não fabricar marker retroativo.

Revalidar disponibilidade ativa de perfil restaurado antes de abrir instruções.
Token liga identidade nativa do vínculo e perfil ou hash de preset. Perfil
arquivado é conteúdo próprio preservável, sem habilitar geração/unarquivar.
Complementos mantêm ajustes de traits antigos válidos sem cruzamento por nome.

Extrair projeção pura portablePersonaProfile para livros e aventuras, mantendo
exportação antiga por alias e serializer de livro. Novo DTO de aventura tem
kind persona/scope/bindingId/personaId/profile; não faz cast de payload de livro.
Projeção conserva valores literais dos campos/traits reconhecidos, excluindo
restoreOrigin, owner, recibos, chaves/provedor/extras. Leitura integral do perfil
usa máscara conhecida e reconfere identidade da metadata no mesmo snapshot.

## Limites

Faixas UTF-8 64 KiB/hash integral. Não captura chat/modelo/provedor/chaves.
Não inclui biblioteca inteira, mídia ou selo global. Pacote/restore/UI e
validate de P2 seguem pendentes. Sem writer/Rule/runtime/persistência ou
dependência novos. [Plano 154](../tasks/writer-v2/execucao/154-personas-no-backup-de-aventuras.md)
e [evidência parcial](../entregas/2026-10-26-writer-v2-personas-no-backup-de-aventuras.md).
