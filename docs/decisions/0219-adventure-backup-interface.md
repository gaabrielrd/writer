# ADR 0219 — Geração do backup privado de aventuras

- Data: 2026-10-28.
- Estado: implementado e validado localmente no fechamento integral 195–197.
- Plano: [197](../tasks/writer-v2/execucao/197-geracao-do-backup-de-aventuras-pela-interface.md).

## Contexto e decisão

A captura existente passa a ser acessível pela interface da aventura e dos
editores de cena/bloco. O estado salvo é o padrão. No editor, o usuário pode
incluir explicitamente o texto aberto; o snapshot é congelado antes do primeiro
await/seletor. A contribuição conserva recurso, revisão e instante de captura,
separada do manuscrito salvo. Não enumeramos rascunhos privados do dispositivo.

A fronteira pública contém somente 17 leitores explícitos, com UID, App Check,
headers privados/no-store e os limites do callable comum. O dispatch não escolhe
método pelo payload. A composição reutiliza sete serviços existentes e o port
backupStorage de gerações/ranges; o port genérico de imagens não satisfaz esse
contrato. Helpers e chaves de retomada não são endpoints de captura.

O adaptador cliente tem schema próprio fechado e paridade testada com os 17
métodos. Captura metadata antes de await e confere conta/aventura/guard antes
e depois do SDK. A região é us-central1; não introduz retries ocultos.

A exportação inicia o seletor dentro do gesto e escreve o container por partes,
com File System Access em contexto seguro. Não há fallback que acumule todo o
arquivo em Blob ou localStorage. Close só ocorre após prova de captura e selo
completos. Falha de fonte, escrita, conta ou cancelamento encerra o produtor e
aborta o destino; falhas de limpeza também são conservadas. Cancelar o seletor
é distinguido de falha após abrir o arquivo. Sucesso exige close confirmado.

O diálogo usa shared/ui, tokens e sessão por conta/aventura. Desmontagem invalida
resultados tardios; pedido simultâneo é bloqueado. Os botões de salvar e cancelar
têm identidades DOM distintas para que o segundo clique de um duplo clique não
cancele a operação que acabou de começar.

## Evidência e limites

O corpus atravessou os 17 leitores reais com texto Unicode grande, lore local,
persona, duas versões manuais e PNG por dois usos. A jornada Chromium gerou
316497 bytes, com escrita máxima de 65706 bytes incluindo framing, e restaurou
o arquivo pela interface. Conservou salvo, rascunho separado, histórico, lore e
duas imagens ativas. Alteração concorrente e cancelamento preservaram o arquivo
anterior após abort nativo. Três temas, 1280/320 px e teclado conferidos.

O arquivo/handle/writable OPFS, IndexedDB, Web Locks e WebCrypto eram nativos;
somente o chooser e Auth/App Check/SDK eram sintéticos. Os serviços reais
usaram doubles de metadata/Storage. Isso não comprova seletor do SO,
credenciais reais, Firestore/Storage remotos nem implantação.

Não adiciona dependências, Rules, índices, segredos ou configuração remota.
Endpoints novos precisam de implantação coordenada para uso com conta real.
A auditoria ampla de P2, P3/D, F2-09 e gates humanos/comerciais continua aberta;
macro 8/35 inalterada.

## Fechamento integral

[Evidência local](../entregas/2026-10-28-writer-v2-backup-de-aventuras-pela-interface.md):
4791 frontend, 90 scripts, 3798 Functions e sintaxe de 393 módulos; cobertura,
tipos/build/smoke verdes. Os 24 hashes de código foram conservados durante o
validate 195–197. A auditoria ampla de P2 permanece separada deste fechamento.
