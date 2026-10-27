# P2 — validação semântica persistente da aventura recebida

Base: 6ac71f5. Conectar transporte/provas de 169 à máquina por etapas de 168.
Objetivo: confirmar conteúdo no servidor com estado/índice privados e transacionais,
sem ativar ou expor projeto. Não confiar em flag/hash declarados pelo cliente.

## Descoberta

Grafo writer-v2 consultado sem resultado suficiente. Conferidos Store/Contracts/
Chunks/Integrity/Transfer de aventura e Source/Validation/Store de livro. Reusar
as primitives de aventura; não converter DTO/serviço de livro por cast.
MCP parcial já indexado; não repetir indexação que falhou antes.

## Plano sequencial

1. Metadata fechada de validação e evolução explícita dos estados de job para
   validating/content-verified/content-rejected. Jobs anteriores sem validação
   continuam legíveis; ausência não autoriza namespace órfão. View/recibo têm
   somente fase/contagens/falha/summary limitado, nunca checkpoint/SHA state.
2. Fonte privada por UID/jobToken/checkpoint: ranges limitados, chunks/provas
   imutáveis conferidos, cópia de bytes e cache/observações limitados por passo.
   Antes de confirmar efeitos, reconferir contexto/tokens/provas observados na
   transação final. Nunca ler projeto inteiro nem expor os bytes em endpoint.
3. Índice privado e itens com buffers descartáveis, até 96 writes por passo,
   entradas até 16 KiB e até 384 observações de índice. Chaves/endereço, contexto,
   nascimento/hash/recibo criador conferidos; não adotar órfão/duplicado.
   O item aponta ao arquivo, não copia prosa.
4. Snapshot atual mutável de até 64 KiB em validationState/current. Criador
   original e atualizador confirmados por operações imutáveis, nascimento e
   updateTime/hash. Job guarda referência/hash, não o estado. Não manter
   histórico operacional ilimitado de snapshots nem confundi-lo com versões autorais.
5. advanceAdventureRestoreValidation fixa intenção antes de await; prepara um
   passo fora da transação final com efeitos limitados. Recarregar/reconferir
   job, estado, observações e índice; confirmar tudo com recibo/checkpoint juntos.
   Concorrência e mesmo-op replay não duplicam. Erro de I/O/identidade não vira
   rejeição de arquivo; erro de formato/conteúdo conhecido gera rejeição tipada
   sem writes parciais da tentativa.
6. Depois de EOF/semântica, reconferir TODOS os chunks/provas em lotes até 16,
   com membership completo; somente então gerar summary/reportHash no servidor.
   Cópia tem identidade própria e não pode adotar o sourceId do arquivo.
   Conteúdo verificado ainda não concede grants, publica ou ativa.
7. Estender cleanup/recibos/schemas para validationIndex/validationItems/
   validationState, inclusive jobs antigos. Conferir snapshot mutável pelo
   protocolo próprio antes de apagar; não certificar lixo/órfão ou falta.
8. Testes por arquivos nativos/corpus e comparação com leitor contínuo, Node/
   Vitest conforme loader e SDK real demo: sucesso/erro, cada retomada, source
   alterada/ABA, índice/snapshot/recebimento adulterados, falha/rollback/retry,
   corrida/cancelamento, recheck completo e cleanup. Regressões pertinentes do
   transporte e da máquina; checks dirigidos durante ajustes.
9. Revisão/ADR/docs/evidência/commit local. Fechar o grande bloco de validação
   remota com validate integral (worker local limitado se necessário), mantendo
   limites/regras. Não acompanhar CI nem enviar/deployar.

## Limites e continuidade

Cache máximo de 160 chunks por passo cobre unidade de 8 MiB mais framing; não
carregar o arquivo inteiro em cache. Estado criptográfico pode conter fragmento
limitado do arquivo e é privado; não persistir no dispositivo sem cifra.
Não alegar latência/quotas de produção pelo resultado local.

Sem endpoint/cliente/recuperação cifrada, revisão visual, remap/estrutura/lore/
personas/universo/histórico/draft-versão/mídia/counters/audit/ativação neste bloco.
Esses gates continuam necessários antes da restauração utilizável e da UI.
Raiz mínima permanece sem ownerId, invisível, com nascimento anterior ao histórico.
P2/P3/D/F2-09, gates humanos/comerciais e contagem 8/35 continuam abertos.

## Aceites

- [x] Fonte e índice limitados com provas reconferidas antes de confirmar efeitos.
- [x] Estado persistente com nascimento/hash/atualização e replay/rollback corretos.
- [x] Recheck integral e resultado fechado, sem grant/ativação ou buffers no metadata.
- [x] Cleanup completo e compatível, com recusa de órfãos/recriações.
- [x] Testes pertinentes, fechamento integral real, revisão/docs/commit local.
