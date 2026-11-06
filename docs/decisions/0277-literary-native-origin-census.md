# ADR 0277: Cobertura por censo de origens nativas

Status: implementação local; testes preparados e validação pendente.

## Contexto

Ausência de índice não prova ausência de contexto, turno, mensagem ou recibo privado.
Documentos filhos podem sobreviver à remoção do pai, conforme o [modelo do Firestore](https://firebase.google.com/docs/firestore/data-model).
O marcador de lacuna incondicional evitava falso aceite, mas também impedia um inventário
registrado completo em livros sem dados legados.

## Decisão

Substituir o marcador por onze segmentos de metadados nativos paginados. O registro de
capacidades e suas projeções entram no token versão 2. Repetir o censo nas três passagens,
com prova do nascimento do livro, cabeçalho, índice e pais/recibos pertinentes.

Usar consultas de grupo limitadas por referências do UID para localizar filhos órfãos;
rejeitar cursores que troquem conta/grupo. A referência superior UID + NUL depende da
ordenação por segmentos do SDK/Firestore. Exigir testes SDK nativos desse limite e da
paginação, incluindo UID vizinho com prefixo igual, antes de aceitar o protocolo.

Nunca abrir corpos ou respostas para descobrir índices. Sidecars são examinados apenas
pelos campos de identidade. Associar lacunas ao mapa como possibilidades metadata,
sem captura nativa fictícia, leitura literária ou grant histórico.

Catálogo ausente com dados existentes é uma observação untracked, não um catálogo
substituto. Catálogo malformado continua bloqueante nos leitores estritos. O diagnóstico
não habilita escritores antigos nem concede continuidade à conversa.

## Consequências

Um mapa pode encerrar o inventário registrado quando o censo real não encontra lacunas.
Isso não equivale a completude histórica ou narrativa. Uma nota autoral não altera a
cobertura. Mudanças no protocolo exigem nova revisão do registro, sem rebase de mapas.

O rollout exige escritores com clocks e drenagem das instâncias anteriores. As provas
locais de timestamps e as consultas de grupo precisam passar no SDK/emulador no fechamento;
o double prepara cenários, mas não valida a ordenação do servidor.

Ver [incremento 29](../tasks/producao-literaria/29-censo-das-origens-nativas.md).
