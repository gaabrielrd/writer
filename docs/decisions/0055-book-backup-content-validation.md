# ADR 0055 — Conteúdo de backup e índice temporário protegido

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M11](../tasks/writer-v2/execucao/44-validacao-semantica-do-pacote.md).

## Decisão

Separar envelope-only (M10) de content-only (M11). bookBackupSchema fecha os
DTOs de todas as seções v1; bookBackupContent valida framing/EOF, sequência e
unicidade de partes/itens, identidades SHA-256, índices, hashes integrais e relações.
O contrato é puro, com portas de hash incremental e índice confiável; não importa
Node I/O, SDK Firebase, credenciais ou armazenamento do navegador.

Preservar texto exato, BOM, vazio e metadados ausentes. Não normalizar ou inventar
datas. Validar tipos, campos permitidos, versões, IDs, datas, ordens e ranks.
Personas/complementos reutilizam validação pura sem substituir texto pela versão
normalizada. Perfil com mesmo ID precisa ser consistente entre vínculos e draft;
override precisa existir no perfil. Índices de owners incluem donos sem persona.

Filhos de cena e marcos exigem pai existente; cada cena exige corpo com hash/
bytes iguais à metadata. Agrupador existente da cena precisa estar no modo scenes.
Atos/agrupadores removidos, relações locais indisponíveis e referências externas
geram avisos contáveis; não apagar dados, reconstruir pai ou buscar origens.
Histórico aceita recursos removidos e draft é contribuição separada. Nas relações
de lore, um ID local literal existente tem precedência sobre aparência de prefixo
externo; somente universe/adventure usam o formato qualificado legado.
Validar unicidade de ranks na sequência/slot ativo, excluindo cenas arquivadas;
slot ausente usa o padrão A já usado pelos leitores. Não reordenar no verificador.

## Memória, privacidade e disco

Um item JSON tem até 8 MiB e quadros até 64 KiB, com JSON/UTF-8 canônico e
profundidade limitada. Texto/histórico/capa usam hash incremental; não limitar o
total do projeto ou reter lista ilimitada de IDs. Há cópias limitadas do item
durante decodificação; não prometer memória independente do maior item.

book-portability usa OPFS para índice temporário de identidades/hashes/vínculos,
sem prosa, nomes ou títulos. Cada operação tem diretório UUID próprio em
writer-book-validation-v1, nomes HMAC e valores AES-GCM com nome como AAD.
Chaves não extraíveis vivem somente em RAM. Entradas até 16 KiB; quota/permissão
falham explicitamente, sem fallback RAM ilimitado ou envio remoto.

Operação é de escritor único e serial. Após inspeção, erro ou cancelamento,
remover somente o diretório criado; testar isolamento entre operações.
Crash pode deixar ciphertext ilegível sem a chave, não uma revisão recuperável.
Coleta de órfãos e recuperação de revisão confirmada são responsabilidades do host
posterior. Não apagar diretórios de outras operações para liberar espaço.

inspeção congela o sinal antes de await, observa cancelamento também após cleanup
e só retorna relatório depois da limpeza confirmada. Falha dupla preserva erros
originais em AggregateError. Não transformar falha de cleanup em sucesso.

## Limites

content-only não comprova autoria, permissão, compra ou ativação. Servidor futuro
deve validar arquivo e autorização novamente, remapear e reconstruir estado privado;
não confiar no índice/relatório do cliente. Flags locais não publicam nada.
Capa é verificada por manifesto/assinatura/bytes/hash; decodificação e normalização
segura antes de materializar mídia continuam exigidas do restaurador.

Não implementar leitor JSON v1–v6 neste marco: ele deve convergir para o mesmo
modelo sem fabricar histórico/datas ou promover lore global inline a lore local.
UI, reserva/ativação/cleanup de restauração e recuperação continuam em P1.
[Evidência M11](../entregas/2026-10-22-writer-v2-validacao-do-conteudo-do-backup.md).
Sem nova dependência, RPC, Rule, coleção ou crédito; somente commits locais, sem CI.
