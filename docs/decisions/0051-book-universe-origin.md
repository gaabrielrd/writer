# ADR 0051 — Origem de universo no backup sem cópia global

- **Estado:** adotado localmente em 2026-10-21, sem deploy.
- **Contrato:** [M7](../tasks/writer-v2/execucao/40-origem-de-universo-no-backup.md).

## Decisão

getBookBackupUniverse recebe somente livro/origem M3b e token de conferência
opcional. Reautoriza livro próprio ativo e resolve universeId da raiz em
transação; não aceita caminho/ID arbitrário de universo.

Ler authorId/deleting por máscara, sem nome, descrição, lore ou subcoleções.
Aplicar a regra atual de universes: autor próprio e raiz não deleting.
Descriptor portátil fechado: none; reference com id e criação nativa precisa;
unavailable somente com id. Origem ausente, deleting ou alheia tem a mesma
representação indisponível. Vínculo inválido falha antes de construir caminho.

Token privado fixa origem/UID/livro/descriptor. Somente quando autorizado inclui
identidade nativa integral do universo; edição ou recriação invalida. Quando
indisponível, não incluir identidade/dados externos no token: alterações de uma
raiz alheia não se tornam um sinal observável. Mudança de disponibilidade invalida.

## Arquivo e restauração futura

bookUniverseCapture emite um registro book-universe com schemaVersion/origin.
Prova privada não entra no arquivo. verifyBookBackupUniverse exige origem/token
idênticos após demais seções e antes do selo M2. Copiar/criar universo ou conceder
acesso não faz parte desse fluxo.

Created nativo é identificação, não autorização. Na restauração futura, conferir
a mesma encarnação e autorização atual no servidor, junto à ativação e ao vínculo/
contador estritos. Não depender da existência do livro original para restaurar
seus dados próprios. A captura atual depende do livro salvo; o leitor/restaurador
futuro resolverá o descriptor do arquivo por contrato próprio.

Reference nunca restaura edição histórica do global; usa estado atual autorizado.
Unavailable não vira reference pelo reaparecimento do ID. Legados sem identidade
nativa precisam de aviso de ausência de prova. Estas regras de restauração
permanecem requisitos, não uma ativação já implementada.

Sem escrita, coleção, Rules, dependência, crédito ou permissão nova. A
[entrega M7](../entregas/2026-10-21-writer-v2-origem-de-universo-no-backup.md)
separa prova SDK/Chromium de Auth/App Check produtivos, UI, sink persistente e
restauração ainda pendentes. P1/F2-09 abertos; somente commit local, sem CI/push.
