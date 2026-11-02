# P2 — controlador da preparação de aventuras

Base: 5c72559. Sem subagentes, CI ou operação remota.

## Descoberta

O progresso nativo não tem ownerId/keyId; identidade e revisão vêm do contexto
privado e jobToken nativo. staging.version é 1, com fases próprias; não usar
schemas/fases do livro. Há auditoria antes da biblioteca de imagens e outra
depois: audit-ready sem libraryImages instala biblioteca; image-library-ready
inicia nova auditoria; só audit-ready com instalação completa pausa para revisão.

## Objetivo e contrato

Executar uma unidade explícita dos 14 comandos de preparação por step, com
journal cifrado prévio e recibo confirmado antes de limpar a pendência.

- Leitor/projeção de progresso próprio: identidade/revisão/checkpoint/estado,
  validação/staging públicos válidos, sem fonte, prosa, tokens de ativação ou
  dados privados. Reutilizar validadores puros de views da aventura por
  declarações TS estreitas; não importar I/O/Auth/Node para o navegador.
- Mapear todas fases nativas; reconhecer versão/pendências/revogação e pausar
  em arquivo necessário, rejeição, revisão final, ativado/cancelando/cancelado.
  Pausa não é prova de ativação ou grant.
- step serial por instância, guard após awaits. Se há pendência válida,
  repetir exatamente o pedido original sem get/novo ID. Sem pendência: obter
  progresso, escolher próximo comando, persistir intent por CAS e só então
  enviar. Falha/CAS perdido preserva pendência, sem replanejamento automático.
- Recibo exige schema/kind/action/ID/checkpoints/estado compatíveis, views
  válidos e progresso da mesma origem. Progresso posterior em replay histórico
  é permitido; no mesmo checkpoint, estado/metadata devem corresponder.
  Limpar por CAS do intent completo somente após confirmação válida.
- Adaptador callable contextual: entrada fechada, somente getter e 14 comandos,
  identidade capturada, importação Firebase tardia, região us-central1,
  conta/guard antes/depois de enviar. Timeout cliente de 600 s na validação
  e 180 s nos demais pedidos, com margem sobre 540/120 s do servidor.
  Não selecionar método pelo payload.
  Sem getter de chave, ativação, cancelamento, cobrança ou fallback.
- Não remover pendência ilegível após chave revogada. Resolução/descarte
  terminal e efeitos do ciclo de vida terão contratos próprios.

## Arquivos e sequência

1. PreparationProgress/Driver/Callables em services, exports em index.ts;
   declarações dos validadores puros StagingMeta/ValidationMeta em functions/src.
2. Testes dirigidos: fases reais, duas auditorias, estados/pausas, replay,
   confirmação/metadata, CAS/guard/concorrência/falhas e transporte contextual.
3. Integração com pipeline real e journal: preparação até revisão, incluindo
   imagem e resposta perdida/recarga. Usar browser/armazenamento nativos quando
   pertinente; backend/Storage de teste, sem credenciais/rede de produção.
4. Tipos/lint/arquitetura/format/docs, revisão/ADR/evidência e commit local.
   Validate integral no fechamento do bloco do cliente, conforme operador.

## Aceites

- [x] Todas fases nativas escolhem uma unidade ou pausa correta.
- [x] Persistência antes do envio, replay exato e confirmação antes da limpeza.
- [x] API contextual fechada, conta/guard e nenhuma ativação automática.
- [x] Pipeline integrado/recarga, testes/checks/documentação e commit local.

Não escopo: start/upload/bootstrap/revisão de arquivo, efeitos de ativação/
cancelamento/mídia/coleta, UI/roundtrip, P3/D/gates. P2/F2-09 e macro 8/35 abertos.

## Resultado

169 testes em cinco arquivos; após ajustar timeout do SDK, retake somente do
transporte 35/35. Sete verificações Chromium com journal/recarga/pipeline de
imagem positivos; caso sem imagens em Vitest também exige duas auditorias.
Tipos/lint/arquitetura/bundle/smoke e checks documentais positivos.
A [evidência](../../../entregas/2026-10-28-writer-v2-controlador-da-preparacao-de-aventuras.md)
distingue banco de teste, bridge HTTP, serviços reais e autorização sintética.
Somente commit local; bootstrap/revisão/efeitos/UI continuam pendentes.
