# ADR 0278: Processo editorial portátil separado de execução nativa

Status: núcleo puro local; integração e validação pendentes. Produtores desligados.

## Contexto

O pacote privado precisa preservar a intenção e a história editorial, mas recibos,
origens nativas e autorizações de um projeto não podem ativar operações na cópia.
O pacote atual tem sete seções e restauração transacional com raiz ausente.

## Decisão

Definir uma seção editorial versionada com artefatos tipados e referências lógicas.
Compartilhar os registros canônicos de campos de contrato/planejamento. Preservar texto,
revisões, datas e ausência; não serializar jobs brutos, credenciais ou tokens nativos.

Remapear identidades por nova cópia, utilizando a fórmula nativa para recursos e
namespace próprio para artefatos editoriais. Preservar substituições, evidências e
relações, deixando referências externas indisponíveis até reconciliação.

Checkpoints são registros históricos, nunca pedidos retomáveis. Todo artefato importado
exige revisão, publicação privada e execução desabilitada. Preferências de colaboração,
aceites e cobertura declarados na origem não substituem o aceite da nova execução.

A futura versão do pacote só pode ser produzida após integrar framing, validação
incremental, captura reautorizada, cleanup/inventário e ativação/restauração completos.
Schema, hash e relatório cliente não autorizam materialização ou busca de fonte externa.

## Consequências

É possível preservar o processo sem reativar IDs antigos, publicar ou cobrar novamente.
Fontes indisponíveis precisam aparecer para reconciliação. Prosa e histórico extensos
permanecem nos streams existentes; o arquivo não deve carregar o projeto inteiro em RAM.

O núcleo ainda não exporta ou restaura uma seção editorial. A implementação final deve
materializar guia/planos utilizáveis e manter evidências/checkpoints históricos privados,
com todas as provas nativas e sem adoção silenciosa. Ver [incremento 30](../tasks/producao-literaria/30-contrato-da-portabilidade-editorial.md).
