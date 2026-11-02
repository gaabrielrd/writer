# P2 — geração do backup de aventuras pela interface

Base: 7574f04. Sem subagentes, CI, push ou deploy.

## Objetivo e descoberta

A restauração já está no Estúdio. A captura por stream existe, mas seus 17
leitores internos ainda não são exports públicos do index, e não há geração
de arquivo na interface. Expor somente esses leitores com Auth/App Check,
preservar seus validadores/provas e ligar captura coerente a um destino nativo
de arquivo. Usar backupStorage já existente para metadata/hash/ranges; assets
genérico não possui o contrato completo de geração/metageneration/accepted.

## Requisitos

- Lista pública imutável de 17 métodos de leitura, dispatch explícito antes do
  fallback genérico e exports literais, headers privados/no-store/Vary Auth.
  UID obrigatório; App Check e limites existentes preservados. Helpers/chaves
  não são endpoints. Factory compõe sete serviços existentes sem mudar regras.
- Adaptador SDK contextual por UID/aventura/guard, import tardio, região/prazo
  compatíveis e payload metadata fechado/copiado antes de await. Métodos nunca
  vêm do payload; recusar campos desconhecidos/contas/origens inválidas.
- Destino File System Access com escrita por blocos, close somente após prova/
  selo completos; abort e fechamento dos produtores em falhas/conta/cancelamento.
  Não acumular o arquivo inteiro em memória nem usar fallback Blob/localStorage.
  Navegador sem suporte explica a limitação e não inicia captura.
- Picker iniciado no gesto; congelar rascunho explícito antes de await/picker.
  Cancelar o chooser não grava nem mostra sucesso; erro depois de abrir destino
  aborta e não é confundido com cancelamento do usuário.
- Dialog com escopo completo, histórico integral e imagens por uso. Origem de
  universo é referência, não cópia de lore global. Somente o estado salvo por
  padrão; opcional texto aberto de cena/bloco, escolhido explicitamente e
  preservado separado. Não enumerar rascunhos do navegador nem salvar manuscrito.
- Integrar ação na AdventurePage e editores de cena de aventura/bloco, pelos
  exports públicos. Livros mantêm seu fluxo. Cena/bloco fornece snapshot atual
  de texto/revisão/recurso e tempo de captura; streams/provas continuam verificando
  fonte real e mudança concorrente impede arquivo confirmado.
- UI cobre pronto, gerando, cancelado, erro/retry e salvo real. Fechar/desmontar/
  trocar conta/aventura aborta e suprime resultado tardio. Somente close confirmado
  permite sucesso. Kit shared/ui, tokens e retorno de foco.
- Captura/servidor não publica, cobra créditos, altera original ou cria projeto.
  Arquivo baixado deve ser aceito por inspeção/restauração, conservando salvo,
  rascunho separado, histórico e imagens. Corpus amplo inclui alterações de
  fonte, texto grande/Unicode, imagens e falhas de destino/acesso.

## Arquivos e sequência

1. adventureBackupCallable/Service, declaração de tipos, index e testes Node/SDK.
2. AdventureArchiveCallables, destino/sink e serviço de exportação próprios,
   com testes de payload/conta/picker/abort/prova/rascunho e regressões.
3. AdventureBackupDialog/CSS, exports e ações nos três pontos do produto,
   com testes de UI/integração e captura explícita do texto.
4. Chromium isolado com OPFS/writable nativo e chooser sintético, UI/serviços/
   arquivo real e restauração; temas/mobile/teclado. Não confundir com diálogo
   do SO, credenciais reais, Storage remoto ou produção.
5. Revisão/docs/evidência; fechar 195–197 com npm run validate integral,
   corrigindo falhas sem reduzir cobertura. Commit local com hooks normais.

## Suposições, riscos e não escopo

File System Access é o mesmo requisito do backup de livros. Mudança concorrente
pede nova captura, sem congelar o editor por transação remota. Rascunho é
contribuição explícita; seu timestamp registra a captura, não inventa data de
persistência passada. Provas de autoria/acesso continuam no servidor.
Não alterar outros backups ou introduzir cache de chave/fonte.
P3/D, campanhas portáveis, comércio, implantação e gates humanos permanecem
fora desta entrega; P2/F2-09 não serão considerados concluídos sem sua auditoria.

## Aceites

- [x] Transporte público dos 17 leitores comprovado sem helpers/chaves.
- [x] Destino por stream confirma close/prova e preserva falhas/cancelamentos.
- [x] UI gera arquivo e inclui texto aberto somente por opção explícita.
- [x] Arquivo gerado funciona na restauração e preserva dados do corpus.
- [x] Tipos/lint/styleguide/arquitetura, testes e validate integral verdes.
- [x] Revisão/documentação/evidência e commit local.

## Resultado local

[Entrega e fechamento integral 195–197](../../../entregas/2026-10-28-writer-v2-backup-de-aventuras-pela-interface.md):
4791 frontend, 90 scripts, 3798 Functions, sintaxe de 393 módulos e build/smoke
verdes, sem redução dos limites. Nove verificações Chromium com arquivo nativo,
três versões e duas imagens. Schema cliente próprio substitui import operacional
do callable no frontend, com paridade dos 17 métodos testada.

P2 ainda exige auditoria ampla de consumidores/corpus; P3/D/F2-09 e macro 8/35
continuam abertos. Endpoints sem implantação; somente commit local.
