# Writer V2 — Retomada nativa das variantes

- Data: 2026-10-29.
- Branch: codex/writer-v2; base be6a8ca.
- Plano: [237](../tasks/writer-v2/execucao/237-retomada-nativa-das-variantes.md).
- Decisão: [ADR 0267](../decisions/0267-campaign-variant-authorization-edition.md).
- Estado: correção interna validada; sem ativação/UI.

## Objetivo e funcionalidades

Variantes com corpo parcial podem retomar após devolver permissão à mesma
origem, sem reescrever o texto ou os corpos já gravados. Cada tentativa segue
dependendo de autorização atual. Revogar/devolver durante a leitura invalida
aquela escrita; origem recriada não herda acesso. Alvos têm a mesma proteção
e relações opacas do arquivo não ganham descritores após reautorização.

Novos estados/jobs/journals usam authorizationCodec edition-v1, interno.
Decisão persistida vincula edição/identidade/âncora/disponibilidades; prova
corrente estrita continua comparada entre antes/depois de I/O.
Codec desconhecido/mistura de modos é recusado.

## Critérios atendidos e arquivos

- [x] Falha reproduzida no código anterior após três corpos parciais.
- [x] Retomada revalidada após atualizações nativas de owner e alvo.
- [x] Mudança durante bytes preserva checkpoint e impede escrita.
- [x] Omissões/relações opacas não revivem; bytes/limites/revisões preservados.
- [x] Wire legado continua legível/coletável e preserva literalmente prefixos.
- [x] Legado parcial cuja prova mudou dá motivo explícito de nova preparação,
      mantendo conteúdo e cancelamento/coleta disponíveis.
- [x] Journals versionados conferidos pelas âncoras e coletados sem grant/chave.
- [x] Progresso não expõe o discriminante interno.

Formato/origem/coordenador/writes de variantes e contratos opcionais;
journal nativo recebe opcionais fechados por configuração; seleção por âncoras
inclui codec para validar o mesmo hash/nascimento. Teste/helper e fixture
histórica comprimida, SDK próximo e documentação. Sem dependências novas.

A fixture de 576.812 bytes Brotli foi capturada de be6a8ca antes da mudança,
com 461 registros e metadata simulada. Somente dados fictícios, chave pública
de assinatura e AES de teste; nenhum material de produção ou chave privada
de assinatura. JSON descomprimido tem 1.276.773 bytes; helper limita a 2 MiB.
Não depende de histórico Git ou rede no ambiente de teste.
Veja [a descrição](../../functions/test/fixtures/campaign-legacy-variant.md).

## Testes e validação observados

326 testes Node distintos positivos: 319 regressões e sete novos.
m160-directed.log: 326/326, zero falhas/skips/cancelamentos,
236.194,4632 ms. Antes disso, a família nova teve 7/7 em 16.466,0389 ms.
A asserção reforçada de prefixos foi conferida isoladamente: 1/1,
237,8529 ms (runner 815,0058 ms), sem somar reexecução como caso distinto.

Novos casos: owner revogado/devolvido com metadata nativa, mudança dupla no
mesmo I/O, alvo negado antes dos bytes e revalidado, relação opaca cujo alvo
volta, continuação do wire anterior sem alterar journals/chunks/corpos,
motivo explícito de restart legado seguido de cancel/coleta, codec desconhecido.

SDK/Rules: 1/1 positivo, zero falhas/skips/cancelamentos,
308.297,3758 ms; runner 309.787,2036 ms (m160-sdk.log).
Serviços nativos criaram aventura/cena/lore/captura, variante longa,
comparação e adoção keep-local. Arquivo assinado foi enviado/revisado;
primeiro lote materializou três corpos, sem overlay. Revogar owner impediu
leitura de bytes; devolver acesso à mesma origem permitiu o lote seguinte.
Texto completo permaneceu exato e o primeiro journal não mudou.

A jornada prosseguiu pela âncora histórica, verificando novos journals pelo
codec. Slot antes dos filhos, birth de recibo/slot e pai/journal, testemunhas
históricas, Rules negando recursos pendentes, cancel após nova revogação e pai
preservado com filho estrangeiro foram conferidos. Remover somente o dado
injetado permitiu coleta de bases/journals/slots e preservou campanha original
e recibo histórico. Emulador demo/JAR verificado, porta efêmera e encerramento
pelo próprio runner; servidor manual não foi reiniciado.

Arquitetura, sintaxe de 488 módulos Functions, ESLint dos dez arquivos de
código, formato/docs/diff e scan dirigido de segredos/artefatos positivos.
Fixture descomprimida também foi conferida como dados fictícios, sem chave
privada de assinatura ou padrões de credenciais reais.
Não houve typecheck/build/visual: frontend não mudou. Validate integral fica
para o fechamento do bloco; o baseline 3c1cefa cobre 227–232, não este código.

## Correções e revisão

A reprodução anterior comprovou a falha, em vez de inferi-la só do padrão do
código. Antes da mudança, a fixture histórica retomou no leitor antigo.
Novo discriminante evita reinterpretar hashes/cifras já persistidos.
O ID de posicionamento da primeira fixture foi ampliado para respeitar o
mínimo de 16 caracteres; permissões/quotas não foram alteradas.

Opcionais do journal continuam vazios por padrão em own/base/anchor; não
foram ampliadas máscaras de prosa nem contratos públicos de arquivo.
Legacy incompatível preserva dados com motivo explícito; não é considerado
retomável após qualquer mudança de prova antiga.

## Limitações e próximos passos

Nenhuma campanha/base/geração foi ativada por esta correção. Mídia/binários/
pins, universo organizacional, C4 adequado para temporários, auditoria física,
ativação/aposentadoria dos journals e Estúdio/ciclos continuam necessários.
Layouts C4 1–4 intactos. Macro 8/35 (22,9%), P3/D/F2-09 e condições humanas/
comerciais permanecem abertos. Somente commit local, sem CI/push/PR/merge/deploy.

## Verificação manual

Sem entrada nova no Estúdio. Exercitar campaignRestoreVariantResume em Functions
e a família SDK/Rules homônima no emulador demo. No produto futuro, o motivo
variant-authorization-restart-required deverá orientar nova preparação explícita
de jobs antigos sem descartar conteúdo ou dispensar autorização corrente.
