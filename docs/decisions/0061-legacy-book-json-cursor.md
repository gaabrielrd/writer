# ADR 0061 — Scanner legado com continuação lexical

- **Estado:** adotado localmente em 2026-10-22.
- **Contrato:** [P1 M17](../tasks/writer-v2/execucao/50-scanner-json-legado-com-cursor.md).

## Decisão

readBookLegacyJSONStep é a única gramática JSON do leitor legado. A API
scanBookLegacyJSON chama esse passo e mantém o fingerprint incremental/callbacks.
Não há parser novo permissivo ou JSON.parse do projeto inteiro.

Cada passo lê até 64 KiB e emite até 64 valores concluídos, em ordem pós-filhos.
Devolve somente os bytes consumidos nessa janela para alimentar hash, além dos
spans e cursor. Pode ler adiante antes de atingir 64 eventos; a continuação relê
a sobra. Nenhum buffer de entrada permanece no cursor. Leituras totais podem
sobrepor janelas; o limite é de trabalho por passo, sem promessa de leitura única.

Pilha contém objetos/arrays, posição dos itens e chaves decodificadas já vistas.
Token contém modo de número/literal/escape e bytes de uma chave em andamento.
Strings de conteúdo e listas de itens não são acumuladas. UTF-8 conserva estado
entre janelas, recusando overlong, surrogate codificado, acima de U+10FFFF,
continuação isolada e EOF parcial. BOM é aceito somente no início.

Preservar profundidade 24, 64 chaves por objeto, até 258 bytes raw da chave com
aspas, comparação decodificada de duplicatas e recusa de **proto**. Arrays não
ganham limite de quantidade. JSON v1–v6 continua usando spans de item até 8 MiB
nos mesmos leitores de domínio.

## Cursor e integração futura

Cursor fechado/versionado, clonado e reconferido na entrada e saída, até 512 KiB.
O teto permite combinar todos os limites antes existentes, incluindo pilha com
muitas chaves longas; não aplicar o teto de 64 KiB do estado M16 a este cursor.

Este módulo não persiste no servidor. Antes de integrá-lo, ampliar/versionar o
snapshot privado do job e manter inventário/cleanup e vínculo de nascimento
nativos. O tamanho do arquivo no cursor não prova identidade dos bytes: leitura
servidor continua exigindo fonte/provas M14, observações M16 e recibo atômico.

Catálogo e normalização ainda precisam ganhar passos limitados; o endpoint M16
continua retornando legacy-validation-pending para JSON antigo. Só o scanner
retomável não conclui validação servidor, P1 ou F2-09.

## Verificação

Regressões dos seis formatos, novos testes com cortes em cada byte e cursor
serializado, casos extremos dos limites, fuzz determinístico comparado ao scanner
anterior e File/OPFS reais no Chromium. A
[entrega](../entregas/2026-10-22-writer-v2-scanner-legado-com-cursor.md) distingue
prova lexical, domínio cliente e integração servidor ainda pendente.
