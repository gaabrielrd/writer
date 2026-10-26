# Writer V2 — histórico no backup privado de aventuras

Data: 2026-10-26. Branch codex/writer-v2. Base: f8a5f4b.
[Plano 153](../tasks/writer-v2/execucao/153-historico-no-backup-de-aventuras.md),
[ADR 0176](../decisions/0176-adventure-backup-retained-history.md).

## Escopo entregue

Novo adventureBackupHistoryRead captura versões manuais e before-restore de
cenas/blocos como cabeçalhos e chunks, por metadata paginada e unidades JSON
até 64 KiB. Confere fonte e identidades nativas de versão/pai/chunk; verifica
target, resource, ordinal/endereço/UTF-8 e nascimento da raiz. Não adota histórico
de raiz recriada nem exige fonte corrente para preservar versão própria retida.

Preserva rótulos/datas/texto literalmente, incluindo vazio e escape JSON maior
que uma faixa. Schema externo/de livro, draft e marcadores desconhecidos falham.
Sem writer/Rule/runtime/UI/persistência/dependência novos.

## Validação dirigida real

Seleção Node de backup de histórico e produtor nativo:

```text
ℹ tests 66
ℹ pass 66
ℹ fail 0
ℹ skipped 0
ℹ duration_ms 1439.3216
```

33 novos e 33 regressões. Produtores reais criam cena/bloco, versões manuais e
restauração com cópia anterior. Inclui 53 versões, 220.000 bytes Unicode/BOM,
vazio e chunk nativo de 65.536 bytes cujo escape JSON exige mais de cinco faixas,
remontagem/bytes/SHA, metadata sem prosa, schema/target/resource/marcadores,
ancestrais/ABA/root recriada, cursor/conta/intenção e falha/retry sem escrita.
Nove casos iniciais também passaram em 466,8632 ms; não somar execuções.

SDK real no Firestore Emulator 1.22.0 verificado, loopback/projeto demo:

```text
# tests 2
# pass 2
# fail 0
# skipped 0
# duration_ms 16083.0589
M65 targeted adventure SDK passed
```

Cobre 54 versões dos produtores reais (52 manuais de cena, uma de bloco e uma
before-restore), metadata nativa sem texto, duas páginas, chunks ordenados e
manifesto completo de teste, labels, copy anterior, nascimento de head/chunk,
conta/Rules, raiz recriada e retry sem alterar updateTime.
PERMISSION_DENIED nos casos negativos é esperado.

Primeira tentativa SDK terminou sem resultado positivo: JVM caiu por malloc
nativo antes do primeiro cenário concluir. Foram identificados pelos ports e
linhas de comando seis emuladores desta execução que ainda estavam ativos e
encerrados somente esses processos, além do filho de teste preso. Demais
processos preservados; memória virtual livre observada passou de cerca de
1,7 para 5,1 GiB. Logs do crash foram movidos para a pasta de evidência fora Git.

Comando java resolve para launcher Oracle no Windows. Runner QA final usou
executável JDK direto, Xms64m/Xmx512m e ActiveProcessorCount=2, mantendo casos/
volumes/assertions. Ambos os cenários passaram; PID próprio 499008 foi conferido
ausente após encerrar. Nenhum script comum do repositório foi alterado por
esse ajuste de ambiente.

Lint dirigido passou. Sintaxe/docs/arquitetura/styleguide/formatação/diff são
conferidos antes do commit. Validate integral somente no fechamento de P2.

## Revisão e pendências

Hash da unidade JSON não substitui SHA do texto histórico inteiro. Teste inclui
chunk adulterado bem formado para explicitar esse limite: assembler futuro
deve rejeitar divergência de manifesto antes do selo, além de quantidade/
ordinais/bytes. Por isso este incremento não emite arquivo ou afirma fechamento
global. Retenção continua até exclusão explícita, sem prazo automático.

Futuro restore precisa materializar raiz privada pendente antes dos filhos
históricos, ou prover contrato equivalente; recursos históricos sem head atual
exigem remapeamento explícito. Sem bloqueador neste recorte interno.
Personas/mídia, selo/pacote/revisão/restauração/UI/roundtrip e validate integral
ainda pendentes. P2/P3/D, F2-09 e demais fases/gates abertos.
Somente commit local; sem CI/push/PR/merge/deploy/subagentes.
