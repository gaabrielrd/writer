# P1 / M34c — Finalização da versão recuperada e portabilidade

## Objetivo e contrato

Finalizar a contribuição preparada de rascunho como versão manual separada,
preservando o manuscrito atual, metadados e perfil no próximo ciclo de backup.

- Consumir descriptor, perfil, capítulo e corpos somente por artefatos
  comprovados. Revalidar o item M21 e cada observação nativa no commit final.
- Para resultado version, ler corpos de até 64 KiB em transações separadas,
  conferir sequência/UTF-8/hash/bytes e contar com countVisibleWords existente.
  RAM proporcional a um rascunho, não ao livro/histórico; sem novo limite total.
  Commit reconfere provas por máscara, sem reler a prosa inteira na transação.
- Novo workVersions schema1, reason manual e rótulo fixo recuperado; data da
  recuperação e contagem reais. Corpo já preparado permanece imutável.
  Metadata portátil opcional draft guarda capítulo/perfil originais exatos.
- None/saved não criam versão nem alteram capítulos. Descriptor preservado
  para a revisão da preparação; nenhuma configuração antiga é aplicada ao salvo.
- Campo draft opcional em work-version, fechado/validado/remapeado, sem grants.
  Snapshot histórico de perfil não é vínculo ativo nem altera totais de perfis.
- Leitor/captura do histórico preservam draft. Identidade de página inclui
  metadata canônica, e congelamento impede alteração depois do yield.
  Cabeçalho JSON usa partes de até 64 KiB; texto conserva suas partes.
- Listagem de histórico respeita orçamento de resposta para metadata grande;
  cursor continua após último item entregue. Clientes aceitam páginas curtas
  não vazias com cursor, sem aceitar cursor repetido/página vazia ou origem alterada.
- Inventário v11 mantido, sem recurso novo. Progresso v8 finalizado/receipt/header/
  journal atômicos. Fase cover sem consumir a capa; raiz ausente/countReady false.

## Tarefas e aceites

1. [x] Metadata portátil e projeção/captura/remapeamento completos.
2. [x] Observações autenticadas por máscara e finalização transacional.
3. [x] Página por orçamento e captura congelada/paridade de metadata.
4. [x] Testes Node/Vitest/SDK, revisão, ADR/documentação/evidência e commit local.

## Limites e continuação obrigatória P1

O contador existente monta um único rascunho na RAM; não é contador incremental
de HTML/Markdown. Falha de memória/parse/prova não grava header nem recibo.
Metadata além do envelope nativo falha intacta; suporte integral a campos grandes
continua obrigatório antes da ativação, sem truncamento/redefinição de escopo.

Faltam capa, integração de personas, campos grandes/consumidores, certificação/
ativação e host/UI/roundtrip integral/validate. A raiz sintética dos testes prova
leitores/captura, não ativação pelo restaurador. P1/F2-09 e Writer V2 abertos.
Sem API pública, Rule, dependência, crédito, subagentes ou CI/push/PR/deploy novos.

## Resultado local

197 Node e 68 Vitest distintos positivos, mais dois SDK reais. O teste de 20 MiB
confirma 320 partes e contagem exata. Build/smoke cliente positivos; a versão
permanece privada, com raiz ausente e capa ainda não consumida.
[Evidência M34c](../../../entregas/2026-10-22-writer-v2-finalizacao-da-versao-recuperada.md)
e [ADR 0080](../../../decisions/0080-restored-draft-version-finalization.md) registram
resultados, orçamento e limites. P1/F2-09 abertos; somente commit local.
