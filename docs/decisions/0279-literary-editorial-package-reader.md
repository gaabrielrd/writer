# ADR 0279: Leitura editorial versionada sem habilitar produtores ou restauração

Status: implementação local; validação pendente.

## Contexto

A seção editorial exige extensão do pacote e conferência semântica compartilhada. Aceitar bytes de uma versão diferente da declaração nativa do upload permitiria contornar a separação entre leitor e restauração disponível.

## Decisão

Aceitar leitura explícita de archive v1 e v2, cada qual com seções/contagens canônicas. Manter a versão padrão do produtor em 1. Reutilizar a máquina semântica compartilhada e seu índice metadata, com paginação das referências e caminhada incremental de substituições.

Exigir controle editorial terminal, identidades/tipos/revisões coerentes e ausência de ciclos. Preservar descritores externos/indisponíveis sem buscar fontes. Hashes observados ainda não comparados não certificam a versão citada.

Conferir manifesto real contra a declaração nativa do upload. Manter reserva, UI, preparação e ativação fechadas para v2 até concluir captura, inventário/cleanup e materialização. Relatório semântico não autoriza essas operações.

## Consequências

Navegador e servidor interpretam o mesmo conteúdo sem criar restauração parcial em produção. O checkpoint v1 mantém a forma anterior. A preparação definitiva ainda precisa materializar contrato/fichas utilizáveis e manter relatórios/checkpoints históricos privados, sem reativar autorizações.

Ver [incremento 31](../tasks/producao-literaria/31-leitura-e-semantica-do-pacote-editorial.md). Testes preparados, não executados; nenhuma publicação.
