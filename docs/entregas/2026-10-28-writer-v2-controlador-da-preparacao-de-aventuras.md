# Writer V2 — controlador da preparação de aventuras

- Data: 2026-10-28.
- Branch: codex/writer-v2; somente commit local.
- Base: 5c72559.
- Plano: [193](../tasks/writer-v2/execucao/193-controlador-da-preparacao-de-aventuras.md).
- Decisão: [ADR 0215](../decisions/0215-adventure-restore-preparation-controller.md).

## Resultado e escopo

A camada cliente consegue executar uma unidade de preparação, preservar um
pedido incerto e retomar o mesmo pedido após recarga. Novo pedido é persistido
antes do envio; o journal só é limpo após recibo validado. A preparação termina
em revisão, sem ativação automática, depois das auditorias anterior e posterior
à instalação das imagens. A mesma sequência funciona com zero imagens.

Leitor de metadata próprio confere identidade/revisão, estado/checkpoint e
views públicas da aventura, sem reutilizar fases de livro. Remove dados de
fonte/prosa/resumo e tokens de ativação da projeção. Recibo histórico pode
apontar progresso atual posterior; no mesmo checkpoint, metadata e estado
precisam coincidir. Erro/CAS perdido preserva a pendência.

Adaptador contextual valida entrada fechada e somente getter/14 comandos,
com Firebase tardio e conta/guard antes/depois de enviar. Três serviços TS,
três testes, exports públicos e duas declarações TS dos validadores puros já
existentes. Sem mudança de comportamento no backend, dependência, Rules,
índice, secret ou env. Bootstrap/start/upload/revisão/efeitos e interface
ainda não foram ligados; o controlador não está acessível por uma nova tela.

## Testes dirigidos

Primeira seleção: **77/77 em dois arquivos**, **570 ms**, sem falhas/skips.
Pipeline real sem imagens em banco de teste: **16/16**, **2,00 s**, sem falhas/skips.
Seleção final integrada: **169/169 em cinco arquivos**, **10,63 s**, sendo
**95 casos de aventura e 74 regressões do controlador/transporte de livros**.
Na revisão final, o adaptador passou a dar margem aos limites do servidor:
600 s na validação (servidor 540 s), 180 s no getter/demais comandos (120 s).
O timeout é configurado no SDK, sem retry automático ou alteração do backend;
retake somente do arquivo de transporte afetado: **35/35**, **381 ms**, sem
falhas/skips. Não somar esses 35 como casos novos aos 169.

Cobrem persistência antes do envio, replay sem get/novo ID, pausas, identidade/
schema/checkpoint/estado inválidos, intent estranho, recibo incompatível, histórico,
CAS perdido, guard/reentrada, transporte explícito, conta e inputs imutáveis.
O pipeline usa serviços reais e banco transacional de teste: executa todos os
14 métodos até revisão, exige duas auditorias mesmo com biblioteca vazia,
recusa metadata alterada/pendência inconsistente e não ativa a raiz privada.

Lint apontou uma asserção de tipo redundante na comparação do checkpoint.
Removida somente a asserção TS, sem mudança no comportamento JavaScript;
tipos/lint/arquitetura finais passaram. Não houve falha dos testes do produto.

Bundle transformou **3028 módulos em 2,26 s** e smoke passou, com avisos de
chunks grandes/imports dinâmicos sem separação. O código novo ainda não tem
consumidor de interface; o teste Chromium o importa diretamente pelo Vite.
Build verifica a composição atual, não a disponibilidade de uma UI nova.

Não repetidos Functions/SDK/coverage/suíte completa/regressão visual. Não houve
alteração de implementação backend ou interface. Validate integral no fim do
bloco do cliente conforme orientação do operador, sem atribuir a este código
o fechamento anterior de 186–188.

## Chromium e integração com imagem

**7/7 verificações**, **4172 ms**, Chromium **153.0.8010.12**. Contexto isolado,
journal e IndexedDB/Web Locks/WebCrypto reais. O bridge HTTP local usa serviços
reais de aventura, handler privado da chave, banco transacional de teste com timestamps nativos simulados
e adaptador Storage real sobre bucket em memória. Fixture contém PNG válido.

O fluxo efetuou **277 chamadas de unidade**, incluindo a repetição exata após
resposta perdida, e o contador após a recarga registrou **552 reautorizações sintéticas** do journal. Passou por
todos os 14 comandos; conferiu auditoria sem biblioteca e auditoria com uma
imagem instalada, pausou em review-required com journal vazio e raiz ainda
sem ownerId. Após ativação manual exclusivamente na fixture, step pausou em
activated sem enviar nova mutação. Browser/contexto/servidor próprios encerrados.

A primeira execução falhou no primeiro step. O diagnóstico confirmou que
Chromium recusou acesso direto de outra origem à porta auxiliar loopback. As duas rodadas diagnósticas confirmaram
o mesmo Failed to fetch/permissão de address space. O runner passou a usar
ponte na mesma origem da página isolada, encaminhando ao servidor local;
nenhuma proteção do browser nem código do produto foi desabilitado.
A execução final positiva acima usa essa ponte.

Auth/App Check e transporte callable no browser não são reais neste teste.
O adaptador SDK é coberto por mocks dirigidos; o pipeline/handler usa HTTP de
teste com autorização sintética. Não comprova Firestore nativo, IAM, tokens
reais, Storage remoto, deploy ou disponibilidade em produção.

## Revisão e continuidade

Conferidos DTOs/fases da aventura, duas auditorias, views puros sem I/O,
registro antes do envio, confirmação antes da limpeza, igualdade de metadata,
guards e ausência de método escolhido pelo payload/ativação automática.
Formatação/documentação/diff finais acompanham o commit.

Start/upload/bootstrap/revisão/efeitos/UI/roundtrip, P2/P3/D/F2-09, fases 3–5,
gates humanos/comerciais e macro 8/35 permanecem abertos.
Sem CI, push/PR, merge/deploy ou subagentes. Somente commit local.

Conferência final: 17 arquivos no escopo, LF, sem segredo identificado, .env ou
artefato acima de 5 MiB. Tipos/docs finais passaram após o ajuste de timeout.
Checkout principal permanece limpo em 522ccaa; Vite em
127.0.0.1:5173/studio respondeu HTTP 200.
