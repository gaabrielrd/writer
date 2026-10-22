# Writer V2 — Pacote integral por fluxo e gravação (P1 M10)

- **Data:** 2026-10-22.
- **Branch:** codex/writer-v2, somente local.
- **Plano:** [contrato 43](../tasks/writer-v2/execucao/43-pacote-integral-e-gravacao.md).
- **Decisão:** [ADR 0054](../decisions/0054-streamed-book-package.md).
- **Estado:** marco interno validado por checks dirigidos; P1/F2-09 abertos.

## Comportamento implementado

- [x] Compor sete capturas com uma origem fixada, sem array do projeto completo.
- [x] Congelar rascunho antes de aguardar destino/primeira leitura remota.
- [x] Exigir provas e reconferir estrutura, recursos, personas, universo,
      histórico, rascunho, capa e raiz antes de footer/selo.
- [x] Envelope v1 canônico, seções obrigatórias, kinds e contagens limitados.
- [x] Leitura provisória por ranges, relatório envelope-only após selo/EOF.
- [x] Ponte de uma posição, pressão de consumo e cancelamento com RPC tardio observado.
- [x] Adaptador de arquivo temporário, escrita aguardada e close somente no sucesso.
- [x] Injetar histórico no composition root por interfaces públicas.
- [ ] Validação semântica, legado, interface, restauração e recuperação completos.

Sem dependências, Rules, coleções, RPCs ou cobranças novas. Não alterar o exportador
JSON atual ou salvar manuscrito/rascunho/histórico durante captura.

## Testes executados

Node dirigido: **24/24** em 97 ms, quatro novos de pacote e vinte do codec M2.
Inclui footer ausente/forjado, seções ausentes/fora de ordem, kind/versão futuros,
controles não canônicos, IDs inválidos/BOM, corrupção, truncamento, bytes após EOF
e retorno antecipado sem relatório confiável. Fixtures do envelope usam corpos
deliberadamente sem semântica e não comprovam DTO/restauração.

Vitest: primeiro ponte **5/5**, depois composição/sink **10/10**. Regressão final
de book-portability: **114/114**, onze arquivos em 4,56 s. Cobre consumo serial,
ack após yield, produtor incorreto, falha inclusive não-Error, retorno antecipado,
RPC não cancelável tardio, origem/contexto, erro de destino/escrita/close/abort,
erro primário com cleanup e cópia dos frames do adaptador.

Primeira execução de composição encontrou duas expectativas de fixture incorretas:
selo do leitor tem archiveBytes adicional e rascunho exige datas próprias.
Corrigidas sem relaxar o contrato. Lint apontou tipos implícitos dos mocks,
métodos sem this void e preservação de cause; corrigidos. Exceções pontuais de lint
só para rejeição não-Error exercitada e regex que rejeita controles em IDs.

## Chromium, OPFS e emuladores

Probe privado usa Chromium real, Firestore 1.22.0 e Storage 1.1.3 em loopback,
projetos demo e serviços reais do checkout. Runtime/JAR verificados pelo harness.
**Nove cenários em um probe**, 47,64 s, processo Node test positivo (48,58 s).

Arquivo OPFS confirmado e reaberto: **1.462.103 bytes, 170 registros**. Seções:
estrutura 3, recursos 28, personas 4, universo 1, histórico 120, rascunho 5, capa 7.
Conserva 58 versões, recursos removidos/vazios/Unicode/BOM, lore próprio,
cenas/narrativa, estilos usados e origem de universo. Rascunho congelado tem
216.003 bytes. Capa tem 367.074 bytes, SHA-256 Web Crypto independente e PNG
decodificado em 1200x1800.

172 escritas, no máximo uma em andamento, quadro máximo de 65.703 bytes;
nenhuma nova chamada remota enquanto a escrita de teste aguardava. Close uma vez,
abort zero na captura válida. Leitor usa ranges no File, sem Blob/array de frames
do projeto no caminho de produção. Arrays de partes do probe servem só às asserções.

Mudar persona externa sem avançar livro e trocar generation da capa entre
captura e reconferência impedem commit. Cancelamento também aborta: os três
casos preservam o conteúdo anterior do arquivo. Zero erros de runtime do navegador
e requisições externas bloqueadas. Ponte HTTP fixa UID de teste; não alegar
Auth/App Check produtivos ou nova prova de Rules, já separadas nos marcos anteriores.

Primeiro probe falhou no verificador privado ao decodificar UTF-8 estrito de uma
parte arbitrária de JSON, cortada em fronteira multibyte. Corrigida apenas a
varredura de marcadores; textos recompostos continuam com decoder fatal/BOM
literal, bytes e hash independentes. Repetição positiva descrita acima.
OPFS comprova disco/plataforma, não seletor externo, revisão de UI ou restauração.

## Checks e limites

Lint dirigido, typecheck, build/bundle/smoke e sintaxe Functions passaram.
Arquitetura, documentação/links, formato e diff são conferidos no fechamento.
Revisão local dos novos contratos, produtores, cancelamento e sink, sem subagentes.
Validate completo permanece para fechamento P1; sem alegação de cobertura global.

Build mantém aviso de chunks grandes e imports estáticos/dinâmicos de
workHistoryCallables/exportDocx; a composição expõe também avisos de shared/lib e
firebase/functions usados dinamicamente pelos callables. Não alterar a estratégia
do bundle neste recorte. Storage SDK voltou a emitir MaxListenersExceededWarning
na pipeline teeny-request conhecida de M9, sem supressão ou mudança de dependência.
Não demonstrada ausência de vazamento em produção.

Auditoria não repetida: baseline M4 tem três moderados preexistentes, não audit verde.
Nenhuma CI consultada/disparada, push, PR, merge ou deploy. Original master em E
preservada. Este marco não acrescenta tarefa ampla concluída: P1 e F2-09 continuam
abertos para schema/leitor legado, revisão, servidor de restauração e recuperação.

## Reprodução dirigida

```bash
node --test functions/test/bookBackupPackage.test.mjs functions/test/bookBackupContainer.test.mjs
npx vitest run src/features/book-portability/tests
npm run typecheck
npm run build
npm --prefix functions run check
```

Probe privado e relatório m10-native.json ficam em writer-v2-portability-qa no
diretório de artefatos da sessão, fora do Git. Não são comando público de produto.
