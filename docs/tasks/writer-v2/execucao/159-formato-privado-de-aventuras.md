# P2 — formato privado de aventuras

Base: b349b99, fechamento 158. Próximo recorte da portabilidade aprovada: envelope binário e de seções
puro, com identidade própria de aventura e compatibilidade byte a byte de livro.
Ainda não monta todas as views nem restaura ou ativa uma aventura.

## Descoberta e decisão

Grafo writer-v2 não retorna definições; indexação já falhou no ambiente. Fontes
atuais: bookBackupContainer, declarações e testes de container/indexed part/package,
vetor Python v1, consumidores book-portability e inventário 158.

Extrair o algoritmo existente para uma fábrica interna pura, instanciada com
constantes de assinatura e classe de erro de cada domínio. WRITER-BOOK\n e seus
bytes públicos permanecem iguais. Aventura usa WRITER-ADVN\n, versão binária 1;
classes de erro distintas. Mantém SHA-256 em cadeia, selo/EOF, streaming limitado,
64 KiB no leitor indexado, limites atuais e cancelamento. Sem I/O de domínio.

Cursor/index são checkpoints de host confiável, não assinatura nem grant; não
aceitar cursor fornecido por arquivo/usuário ou transferir entre domínios. A
leitura fresca exige assinatura correta. Envelope não valida ownership, completude
de views ou semântica autoral; pacote/assembler/validador continuam independentes.

## Implementação sequencial

1. Extrair o framer mantendo APIs, erros, tipos e golden de livro.
2. Instanciar domínio aventura e declarações de tipos próprias.
3. Fechar envelope canônico com oito seções ordenadas (estrutura, recursos,
   lore, personas, universo, histórico, drafts e imagens), identidade de aventura,
   counts e footer, relatório explicitamente envelope-only. Ainda não certifica
   DTOs ou completude autoral: isso pertence ao assembler/validador seguintes.
4. Conferir vetor Python independente de aventura, rejeição cruzada entre os
   decoders frescos, corrupção/truncamento/versão, ranges em ordinais 9/10,
   cadeias intercaladas e cancelamento sem footer.
5. Rodar testes existentes de livro/container/índice/pacote e consumidores frontend
   pertinentes; typecheck e checks estáticos. Validate integral no fechamento do
   próximo grande bloco, conforme orientação do operador.
6. Revisar diff, ADR/docs/evidência e commit local; depois montar pacote/captura.

## Não escopo

Endpoints, autorização nova, Rules, UI/exportação utilizável, restauração,
novos grants, biblioteca inteira, operação comercial e alterações remotas.

## Aceites

- [x] Golden, APIs, tipos e erros de livro preservados.
- [x] Aventura com assinatura/erro próprios, oito seções e provas dirigidas.
- [x] Checks e evidência real, revisão e commit local.
- [x] P2/P3/D e gates da V2 permanecem explicitamente abertos.
