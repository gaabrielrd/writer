# F2-09 P1 M2 — Contêiner limitado para backup de livros

**Estado:** marco interno implementado e validado localmente em 2026-10-21; CI do novo head pendente.
**Origem:** [P1](31-portabilidade-de-livros.md) e [M1](32-captura-consistente-do-historico.md).
M2 não entrega exportação/restauração ao usuário nem fecha F2-09.

## Objetivo e escopo

Permitir gravar e verificar bytes de um backup por blocos, sem exigir o arquivo
inteiro em memória. Preservar Unicode e bytes exatos, detectar corrupção,
truncamento, reordenação e versão futura antes de qualquer ativação. Não adicionar
dependências. Histórico integral continua obrigatório em P1; tamanho de bloco
é limite de transporte, não de retenção ou número de versões.

Arquivos: functions/src/bookBackupContainer.mjs e declaração .d.mts;
functions/test/bookBackupContainer.test.mjs; functions/package.json (syntax check);
src/features/book-portability/{model,services,tests}/ e index.ts;
documentos de arquitetura, testes, decisão e evidência após validação.
Não alterar UI, leitores JSON v1–v6, grants, Rules ou escritores de domínio.

## Decisão de formato e alternativas

Adotar contêiner binário sem compressão, extensão futura .writerbook e versão
de contêiner 1. A proposta ZIP de P1 não era normativa. JSZip existente continua
para DOCX. Sua [documentação](https://stuk.github.io/jszip/documentation/limitations.html)
informa que async/generateAsync acumulam o resultado; inferimos que reutilizar
essas APIs não demonstra o orçamento exigido. O contêiner evita descompressão,
extração de caminhos e índice completo de entradas. Custo: arquivo maior e
manutenção de um protocolo próprio; compressão só com outra versão demonstrada.

A [File API](https://www.w3.org/TR/FileAPI/#dfn-slice) permite ler intervalos de um
Blob. O adaptador usará slice/arrayBuffer somente no intervalo pedido, nunca
arrayBuffer/text do arquivo inteiro. Isso limita buffers da aplicação por chamada;
não constitui medição da memória interna do navegador.

## Wire normativo

- Cabeçalho: ASCII WRITER-BOOK + LF (12 bytes), seguido de uint32 BE versão 1,
  total de 16 bytes. O selo inicial é SHA-256 desses 16 bytes.
- Quadro: sequência uint32 BE, tamanho de metadata uint32 BE, tamanho de payload
  uint32 BE; metadata UTF-8 canônica; payload; digest SHA-256 de 32 bytes.
- Metadata de registro: JSON.stringify({type:'record',kind,id,part}) nessa ordem.
  kind segue [a-z][a-z0-9-]{0,47}; id é string UTF-8 exata não vazia até 1.500
  bytes, sem slash/backslash, controles, ponto ou ponto-ponto; part é uint32.
  Campos desconhecidos, chaves repetidas, Unicode inválido, BOM e representação
  JSON não canônica são rejeitados. Sem normalização/trim de texto.
- Metadata até 16 KiB e payload até 256 KiB por quadro, conferidos antes de ler
  o corpo. Prefixo de 12 bytes; trailer de 32. Nenhuma alocação por tamanho
  declarado acima desses limites.
- Digest de cada quadro = SHA-256(digest anterior || prefixo || metadata || payload).
  Não é assinatura nem concessão de acesso.
- Último quadro: JSON.stringify({type:'end',records,payloadBytes,chain}), payload
  vazio, sequência igual à contagem dos registros. chain é o digest anterior
  em hexadecimal minúsculo. Contagens são inteiros seguros e devem coincidir.
  O digest final também é verificado; exige EOF exato sem bytes adicionais.
- Sequências começam em zero, sem saltos; no máximo 2^32-1 registros para reservar
  sequência do selo. Soma de bytes/offsets deve permanecer inteira segura.
- O tipo do selo retornado nomeia chainHash, não hash de arquivo inteiro.

O leitor valida framing/integridade; NÃO valida DTO de livro, duplicatas semânticas,
partes por recurso, relações, autorização, completude de domínio ou mídia.
Essa segunda validação é obrigatória antes da preparação/ativação P1 e terá
contrato próprio. kind genérico não autoriza restaurar tipos desconhecidos.

## APIs e memória

Contrato puro compartilhado entre navegador e servidor, sem Node, HTTP, disco,
credenciais ou armazenamento: encodeBookBackup e decodeBookBackup como geradores
assíncronos, usando Web Crypto. Tipos expostos pela feature folha book-portability.
Adaptador Blob fica em services; leitura por intervalo via {size,read(offset,length)}.

Writer pede o próximo registro somente quando o consumidor pede o próximo quadro.
Copia payload limitado antes de aguardar hash; quadro emitido pertence ao consumidor
e não compartilha o estado interno da cadeia. Reader copia bytes de cada intervalo,
verifica o digest antes de emitir um registro e mantém somente quadro/estado atuais.
Acumular registros/frames no consumidor volta a crescer memória e não é exportação
limitada. M1 ainda acumula histórico; integrar captura por sink/fluxo é pendência P1.
Cancelamento é conferido antes/depois de I/O/hash e antes de emitir; erro/cancelamento
não produz selo final. Encerrar leitor cedo NÃO verifica o arquivo inteiro.

A futura restauração só poderá ativar após consumir e conferir selo/EOF, validar
schema/graph completo no servidor e reautorizar origens. Nenhum registro emitido
pelo codec pode escrever projeto visível. Falha de leitura propaga; não troca arquivo,
recupera bytes atuais ou refaz operação silenciosamente.

## Sequência e aceites

1. Implementar codec puro e declaração; fixar vetor binário independente com
   hashlib/struct, incluindo texto português, emoji e payload binário.
2. Testar roundtrip, arquivo vazio, múltiplas partes, buffers mutados, sequência,
   selo/EOF, corrupção, truncamento, tamanhos maliciosos antes do read, tipos,
   UTF-8/JSON canônico, backpressure e cancelamento. Verificar sem fixtures de domínio.
3. Adicionar API pública e adaptador Blob com testes e verificação nativa de
   Blob/Web Crypto, sem introduzir botão de backup incompleto.
4. Rodar testes dirigidos e verificações de arquitetura/tipos/lint; validate no
   fechamento M2. Revisar diff e registrar resultados reais e limites.
5. Continuar captura completa/schema de livro, mídia e restauração em P1; não
   contabilizar M2 como tarefa ampla concluída.

## Riscos e pendências explícitas

- Integridade local não comprova origem, direitos ou autorização atual.
- Sem criptografia do arquivo local neste marco; não persistir bytes em recovery.
- API de gravação streaming compatível/fallback com volumes ainda precisa fechar
  antes do exportador de produto; gerar Blob com todos os frames não prova memória.
- Captura coerente dos demais recursos, mídia autorizada e schema/remapeamento
  semântico continuam pendentes. Restauração religa universo original somente
  conforme política confirmada em P1, sem duplicação.
- JSON v1–v6 continua existindo sem histórico; M2 não anuncia leitor legado novo.

## Resultado M2 em 2026-10-21

Implementado e validado localmente. Node dirigido 20/20, frontend dirigido 3/3,
cinco casos Chromium reais; vetor independente de 404 bytes idêntico nas duas
runtimes. Validate exit 0: 2.548 testes/220 arquivos, 85 scripts e 655 Functions;
cobertura 90.98/85.64/90.68/93.62. Sem dependência ou UI nova.
Veja a [entrega M2](../../../entregas/2026-10-21-writer-v2-conteiner-de-backup.md)
e a [ADR 0045](../../../decisions/0045-book-backup-framing.md).
M2 não aumenta a contagem de tarefas amplas e não fecha P1. Próximos contratos:
schema/captura restante, mídia autorizada e restauração privada, preservando
o histórico integral e o vínculo de universo confirmado pelo operador.
