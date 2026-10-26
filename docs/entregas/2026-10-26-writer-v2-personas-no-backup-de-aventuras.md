# Writer V2 — personas no backup privado de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: f21db1c.
[Plano 154](../tasks/writer-v2/execucao/154-personas-no-backup-de-aventuras.md),
[ADR 0177](../decisions/0177-adventure-backup-used-personas.md).

## Escopo entregue

Novo adventureBackupPersonaRead captura somente perfis usados na raiz/cenas.
Preserva herança dos blocos, IDs privados legados, arquivo e valores próprios.
Confere fonte, vínculo/perfil nativos e prova ativa da biblioteca restaurada
antes de abrir instruções. Metadata paginada não abre prosa nem lista biblioteca;
ausência de vínculo não inventa perfil.

portablePersonaProfile extrai projeção pura já usada pelo livro. Export antigo
continua por alias; DTO da aventura é próprio e não carrega owner, restoreOrigin,
recibos/chaves/provedor/extras de perfil ou trait. Sem writer, Rule, runtime,
persistência, frontend ou dependência novos.

## Validação dirigida real

Quatro arquivos Node selecionados (aventura, livro, disponibilidade e perfil):

```text
ℹ tests 50
ℹ pass 50
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 378.7042
```

22 novos e 28 regressões. Produtor real configura raiz/cena; perfil tem trait
válido no momento do vínculo e edição posterior o remove, preservando ajuste
antigo. Inclui presets/ID legado/arquivado/null, 53 cenas, máscara sem prosa,
campos extras excluídos, alteração/recriação de perfil/vínculo sem mudar a raiz,
lotes pendentes/cancelados/ativos/revogação, contas/schema/flags/cursor/índices,
intenção capturada, conteúdo inválido e erro/retry sem escrita.

Duas seleções iniciais tiveram 29 pass/16 fail em 339,1719 e 403,8355 ms:
fixture enviava sceneToken ao setter que não o recebe; depois tentava configurar
override cujo trait já faltava no perfil. Corrigido teste para contrato real e
para criar vínculo válido antes da edição posterior do perfil. Sem mudar
produtor ou baixar assertions. Seleção seguinte: 45/45 em 402,1241 ms; após
adicionar cinco casos, seleção final acima. Não somar execuções.

Compatibilidade: SHA-256 do caso de referência do serializer de livro, capturado
antes da extração e reconferido depois, permaneceu
1040cf51cf5789c2048c83acd243750c1684a3289daeffd74e87600b55c08794.
Teste conserva esse vetor; demais regressões verificam perfis custom e leitores.
Não alegar novo roundtrip integral de livros nesta alteração.

SDK real no Firestore Emulator 1.22.0 verificado, loopback/projeto demo:

```text
# tests 2
# pass 2
# fail 0
# skipped 0
# duration_ms 9194.0748
M66 targeted adventure SDK passed
```

52 cenas, setters reais de raiz/cena, preset/ID legado, perfil arquivado,
máscaras nativas, biblioteca sem listagem, instrução literal, campos extras
fora, hash, nascimento do perfil, autoria/Rules, lote restaurado ativo por
recibos nativos e revogação antes de abrir instruções. PERMISSION_DENIED negativo
esperado. Runner QA usa JVM direta limitada conforme evidência 153.

Lint dirigido passou; sintaxe/docs/arquitetura/styleguide/formatação/diff são
conferidos antes do commit. Validate integral no fechamento de P2; fonte nova
não é certificada pelo validate antigo de P1.

## Revisão e pendências

Projeção neutra compartilha somente perfil puro, preservando alias/serializer de
livro. ID privado segue contrato nativo sem prefixo obrigatório. Disponibilidade
é revalidada sem cache e instruções não são abertas após revogação. Nenhum perfil
ausente vira fallback, outra biblioteca ou marker automático.
Sem bloqueador identificado neste recorte interno.

Mídia autorizada, selo/pacote/revisão/restauração/UI/roundtrip e validate integral
seguem pendentes. P2/P3/D, F2-09 e demais fases/gates abertos.
Somente commit local; sem CI/push/PR/merge/deploy/subagentes.
