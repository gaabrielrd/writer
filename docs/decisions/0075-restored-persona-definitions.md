# ADR 0075 — Definições de persona na preparação privada

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M31, depois da ADR 0074

## Problema

O backup contém os perfis efetivamente usados por livro, capítulos e fontes de
conversão. Um perfil pode aparecer em vários vínculos; IDs devem ser remapeados,
sem substituir perfil atual, buscar uma definição ausente na biblioteca ou
disponibilizar dados parciais. Quantidade de perfis não tem limite demonstrado.

## Decisão

advanceBookRestorePersonas é interno. Cada unidade lê um item pelo leitor
verificado M21 e confere verify(tx) no commit. O vínculo do livro também confere
metadata do arquivo; vínculos de capítulo/fonte conferem artefato nativo próprio
e seu complemento antes de preparar a declaração.

As coleções preparedPersonas e personaBindings vivem sob o job privado, já
negado ao SDK. Não há escrita em users/UID/aiPersonas. IDs novos seguem M21.
A definição guarda schemaVersion, profileHash e perfil portátil conhecido,
preservando texto bruto, atributos, arquivo, revisão e datas do snapshot.
Preset remapeado também vira definição própria; arquivada não é reativada.

A definição é única por personaId; vínculo é único por hash de scope/ownerId.
Vínculo contém somente IDs e profileHash. Repetir definição idêntica revalida
o par nativo e conserva artefato/journal sem no-op físico. Divergência interrompe.
O contador distinto usa artefatos novos: cada binding é novo, a definição pode
já existir. Não carregar Set/catálogo inteiro para deduplicar.

Na migração para cleanupVersion 9, certificar vazios os dois namespaces e journals.
Endereços são fechados ao job, com IDs tipados. Inventário inclui essas coleções
antes de escrever; cleanup usa pares comprovados, máscaras, limites e certificação
vazia repetida no final. Coleção global e dados de outra restauração são preservados.

Preparação v5 fixa resourceEndIndex para preservar a prova M30 com o cursor
principal avançando em personas. Contadores por scope e perfis distintos fecham
com manifesto/relatório semântico. Estado final universe não consome seu item.
Recibos anteriores e inventários v1–v8 permanecem legíveis/canceláveis.

## Consequências e limites

Definições são snapshots privados preparados, não perfis ativos da biblioteca.
Raiz ausente/countReady false. Revisões/datas das futuras cópias globais e sua
disponibilidade atômica exigem integração própria antes de ativar o livro.
Biblioteca/IA/histórico/backup deverão resolver os perfis copiados autorizados,
sem inferir segurança pelo prefixo do ID. Nenhum desses consumidores foi habilitado.

Legado sem perfil conserva ID remapeado indisponível e aviso, sem adotar perfil
atual coincidente. O schema já limita um perfil; número de perfis continua livre
e o trabalho é unitário. Não inventar defaults nem truncar o conteúdo portátil.

Faltam integração das personas, universo autorizado, histórico/rascunho/capa,
campos grandes, autorização final/ativação e host/UI/roundtrip/validate.
P1/F2-09 continuam abertos. Sem API pública, Rule, dependência, crédito,
CI/push/PR/deploy novo.
