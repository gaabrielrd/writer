# W2-F1-05 — Protótipo e roteiro de piloto

**Base:** `24ad41e`. **Data:** 2026-10-13. **Estado:** em implementação.

## Plano do incremento

1. Criar entrada isolada no servidor visual: Universos, Estúdio, Publicações,
   Catálogo e Biblioteca; navegação de autor, aventura e campanha com dados originais.
2. Demonstrar escrita/revisão/restauração, preparação/revelação/portal/consequências,
   publicação e compra, incluindo carregamento/vazio/erro/sucesso.
3. Usar shared/ui e ThemeProvider existentes, teclado, três temas e 320 px.
4. Criar testes observáveis no harness visual existente, revisar renders e executar validate.
5. Preparar roteiro e formulário sem identidades/manuscritos; não simular resultados humanos.

Arquivos previstos: `e2e/visual/writer-v2.html`, `writer-v2-prototype.tsx`,
`writer-v2-prototype.module.css`, `writer-v2-prototype.visual.ts`; este contrato,
roteiro de pilotos, tarefa/índice e registro em docs/entregas após validação.
O protótipo fica na infraestrutura visual, sem criar rota produtiva, domínio,
persistência ou chamada financeira. Não substitui implementação das fases 2–4.

## Critérios técnicos

- Dois caminhos iniciais com mesmo peso: próxima escrita e próxima sessão.
- Aventura é origem reutilizável; campanha é mesa própria, com consequências locais.
- Público e conteúdo conferidos antes de revelar/publicar, via Dialog compartilhado.
- Portal de demonstração recebe apenas conteúdo explicitamente liberado.
- Compra simulada mostra estado pendente antes da confirmação do cenário de teste;
  sem cobrança, credenciais ou preço comercial aprovado.
- Escrita e notas mantidas ao navegar; restauração explicitamente confirmada.
- Reset recarrega dados fictícios; nenhum dado de participante é persistido.

Compreensão humana, dados/regras reais, CI e integração financeira continuam pendentes.
Os resultados técnicos serão registrados após execução, sem preencher resultados de piloto.

Evidência final: [entrega e screenshots](../../../entregas/2026-10-13-writer-v2-prototipo.md).
`npm run validate` completo passou após as correções, código 0: 116 arquivos/851
testes frontend, 87 backend; cobertura 92,84% statements/86,41% branches/91,32%
functions/94,93% lines. Scripts, lint, tipo, build e smoke passaram; avisos de build
preexistentes permanecem. Docs/formato/diff são reconferidos após registro final.

## Execução técnica

Entrada navegável em `/e2e/visual/writer-v2.html`, com servidor isolado:

```powershell
npx vite --config vite.visual.config.ts --host 127.0.0.1 --port 4189 --strictPort
```

Vite visual recusa build de produção; CSP/rede bloqueiam destinos externos.
Componentes compartilhados são usados diretamente; nenhum fluxo produtivo ou
serviço recebe dados. State React é descartado ao recarregar; tema segue o adaptador
existente. Este protótipo não acompanha o bundle de produção nem substitui novas features.

Cinco testes observáveis × seis projetos Chromium = **30 passaram** na revisão
de 2026-10-13 (54,8 s), com temas claro/escuro/sépia, desktop 1440 px e celular
390 px; dois testes por projeto usam explicitamente 320 × 720 px.
Cobrem Enter/Escape e retorno de foco do diálogo, restauração cancelada/confirmada,
rascunho preservado ao navegar e durante estados; revisão não muda manuscrito;
amostra/audiência conferidas; portal sem segredo/notas; pagamento pendente não libera,
suspensão/perda/integral indisponibilizam e notas próprias ficam visíveis.
Testes de dados/URLs/autorização reais ainda não existem neste incremento.

Revisão independente encontrou três problemas, corrigidos e reconferidos: acesso
derivado por atalhos após revogação, motivo incorreto de disputa perdida e ambiguidade
do produto adquirido em A-06. Campanha autoral e adquirida agora têm notas/revelações
separadas; Sessão/Portal da adquirida respeitam compra vigente, inclusive pelo Estúdio.
Testes negativos percorrem esses atalhos e conferem que a campanha autoral permanece
separada. Nenhum bloqueador remanescente na revisão estática.

Comando executado (porta exclusiva do ensaio):

```powershell
$env:WRITER_VISUAL_PORT = '4188'
npx playwright test --config playwright.visual.config.ts writer-v2-prototype.visual.ts
```

Screenshots em `visual-test-results` são locais e ignorados. Revisão visual direta
conferiu Estúdio claro/escuro e diálogo de revelação sépia a 320 px; geometria
sem overflow/diálogo fora da viewport é verificada em todos os projetos.
Não equivale a teste humano, leitor de tela ou todos os navegadores.

## Navegação e piloto

Proposta: Universos / Estúdio / Publicações / Catálogo / Biblioteca. Livros,
aventuras e campanhas aparecem no Estúdio, com próxima escrita/sessão no mesmo peso.
Operador aprovou explicitamente essa organização para implementação em 2026-10-13,
após receber preview concreto. D-12 tem direção técnica web PT-BR, três temas e 320 px;
orçamento e decisão de navegação são consolidados em W2-F1-06.

[Roteiro](05-roteiro-de-pilotos.md): três autores e três mestres, códigos A1–A3/M1–M3,
consentimento, tarefas, perguntas neutras, gravidade e tabelas vazias. Destino/acesso/
descarte e critérios precisam ser definidos antes de coletar dados humanos.
Participantes serão indicados pelo operador. D-11 não tem resultados ou metas aprovadas
presumidas. Convite real, conflito real e atualização de edição são casos futuros explícitos.

## Limitações do artefato

Planejamento da cena e revisão são ilustrações, não convite/revisão persistente.
Campanha autoral de exemplo existe previamente; botão de aventura abre a mesa preparada.
Biblioteca ativa uma campanha adquirida distinta na demonstração, sem recurso remoto.
Publicação prepara uma demonstração, sem gerar EPUB/PDF/ZIP.
Compra demonstrada usa aventura; conto tem amostra, ainda sem checkout de livro
neste protótipo. Estados de conta, autenticação e checkout real não foram exercitados.
Notas/revelações demonstradas não comprovam isolamento contra requisição de outro ator.
Essas limitações não retiram requisitos do Writer V2; implementação/testes futuros
continuam nas fases 2–5, com pilotos integrados nas tarefas próprias.
