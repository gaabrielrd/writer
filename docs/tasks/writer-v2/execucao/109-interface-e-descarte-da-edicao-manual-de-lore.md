# P1 / M38c5k — Interface e descarte da edição manual de lore

## Objetivo e fronteira

Implementar host visual literal e lista paginada de recuperações, compondo
a sessão existente; finalizar purga local explícita após fechar jobs e chave.
Componentes reais exportados pela feature, prontos para integrar ao compêndio.
Não ativar entrada produtora antes do passo 6 do plano 81 (writers/Rules/
drenagem coordenados). O formulário legado permanece até esse portão;
isto não conclui edição manual/P1/F2-09/V2.

## Requisitos e sequência

1. Descarte tem intenção durável separada de cancel, prova de fechamento/
   revogação e etapas locais limitadas até 50 records. Fence de journal no
   mesmo commit do primeiro lote, com stamp/contador/marker atômicos.
   Remover somente frames/controles do UID/writeId, preservando demais
   operações/contas e tombstone metadata. Journal não pode renascer.
2. Retry após reload/onabort/oncomplete incerto continua o descarte exato.
   Não obter chave nem decifrar para purgar. Não esperar escritor privado
   pendente; suas tentativas tardias devem falhar no CAS/fence.
3. Diálogo novo lê captura C1 bruta autorizada e edita campos explicitamente
   tocados, sem trims/caps/normalizações herdadas. Ausente/vazio distintos,
   aliases/structuredDetails/relações preservados, arrays editados por item.
4. Prepare congela intenção e dirige initialize/advance; apply exige clique
   próprio. Erro conserva o handle e oferece retry; não iniciar outra intenção
   silenciosamente. Retomada confere conta/escopo antes de ler draft.
5. Cancel e descarte continuam acionáveis com produtor/chave em voo.
   Cancel conserva cópia/chave; descarte exige confirmação própria, fecha
   jobs e chave e depois remove IDB. Adoção vencedora é mostrada e preservada.
   Erros/replies tardios não sobrescrevem o estado de encerramento.
6. Fechar/navegar avisa quando há mudanças ainda sem cópia. Fechar com cópia
   mantém recuperação; unmount/conta/escopo fenceiam callbacks e não apagam dados.
   Lista paginada por conta com loading/vazio/erro/retry e filtro do livro.
7. Componentes do kit, tokens/temas, foco/teclado, mobile e estados explícitos.
   HTTP/Auth/IDB permanecem em serviços. Sem dependências ou deploy.
8. Testes dirigidos de purga/concorrência/escopo/literais e componentes;
   Chromium real com backend de fixture, sem confundir com SDK/Auth reais.
   Revisão, docs/ADR/evidência, commit local; validate integral no fim de P1.

## Arquivos e aceite

Contrato/store/controller/sessão de lore; editor literal, diálogo e lista;
testes próximos, estilos e exportações públicas. Meta de descarte é aditiva
no store existente, sem mudar versão do banco. Criar journal consulta fence.

Aceite: usuário prepara/revê/aplica explicitamente, retoma o mesmo pedido,
cancela sem perder texto e descarta somente por ação confirmada. Purga é
retomável, limitada, isolada e impede escritor tardio/recriação. Campos
intocados não mudam. UI não vaza conteúdo após troca de conta/escopo.
Ativação no compêndio, writers/Rules/drenagem, exclusão integrada da chave,
demais consumidores/backup/ativação/rollout e fases 3–5 seguem abertos.

## Resultado do incremento

Host literal/lista exportados e purga limitada/retomável implementados. Apply/
descarte explícitos, conta/escopo/perfil, router/foco, texto/presenças e
fences de escritores tardios cobertos. 241 Vitest distintos em rodadas e
três jornadas Chromium; temas/mobile e capturas inspecionados.
Veja [ADR 0124](../../../decisions/0124-literal-lore-editor-and-local-discard.md)
e [evidência](../../../entregas/2026-10-24-writer-v2-interface-e-descarte-do-lore.md).
Entrada no compêndio espera writers/Rules/drenagem do plano 81. Demais gates
e P1/F2-09/V2 continuam abertos. Validate no fechamento de P1, sem CI/push/deploy.
