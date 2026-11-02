# P1 / M38c3o L3B — Ativação atômica da criação de lore

## Objetivo e aceites

Concluir o backend interno de criação: ativar ficha/geração/leases lógicas/
clock/datas/recibo e sucesso permanente do criador no mesmo commit.
L3A já compõe/audita e limpa tentativas sem cabeça. Interface/endpoint,
demais writers/consumidores/backup/cliente e rollout continuam em passos próprios.

## Sequência

1. Extrair validação de recibos e construção pura do contexto de geração,
   mantendo reexports existentes. Separar prova de binding de sua abertura
   viva para evitar CreatorStore -> EditStore -> CreatorStore.
2. Criar comprovante/prova de adoção privados e imutáveis no criador.
   Validar tentativa/binding, intenção/contexto, recibo original, geração/evento
   de ativação e hashes/nascimentos acoplados sem reabrir cabeça ou prosa.
   Confirmar sucesso após edições/retirada/exclusão sem recriar recurso.
3. Planejar tudo antes dos writes: reserva viva e livro original, compilação
   pronta, cabeça/tombstone ausentes. Criar cabeça (create), ativar geração,
   atualizar clock/datas/flag e gravar comprovantes/recibo na mesma transação.
   createdAt/updatedAt nascem na confirmação. Consentimento ausente é privado;
   true exige campo explícito. Sem publicar, cobrar ou alterar outra ficha.
4. Criador passa a adopted. Cancel e novos uploads/tentativas são recusados.
   Excluir livro reconhece sucesso histórico e limpa preparações não usadas
   pelos protocolos existentes, sem cancelar ou apagar o comprovante.
5. Reader só abre cabeça reservada quando seu createTime coincide com a adoção
   nativa do criador. Validar primeira geração em reedição por esse nascimento,
   sem confundir creationBirth com head birth. Reedições usam contratos atuais.
6. Testar criação literal/ausências/consentimento, CAS/retry/concorrrência de
   tentativas e cancel versus adoção, falhas com rollback integral, raiz/ficha/
   comprovantes recriados, revogação/deleting, segunda edição/retirada e
   exclusão do livro mantendo sucesso. SDK real demo/loopback para atomicidade.
7. Rodar testes dirigidos e checks afetados, revisar diff, documentar ADR/AGENTS/
   evidência e commit local com hooks. Sem CI/push/PR/deploy.
   npm run validate completo no fechamento de P1.

## Arquivos e riscos

Criação (contratos/store/serviço/cleanup), novos módulos de prova/ativação/
guarda do reader, edit adoption/proofs/store/contracts e testes.
Extrair helper somente onde necessário para prova histórica não recursiva.
Sem nova dependência, Rule ou índice esperado.

Não validar sucesso por phase alegada, token do cliente ou cabeça atual.
Comprovante e prova precisam ser imutáveis e nascer junto do recibo/evento/
cabeça original; geração pode ser aposentada depois. Metadados permanentes
continuam verificáveis mesmo quando os corpos forem coletados.
Não expor prosa nem promover confirmação histórica a grant de leitura atual.

## Fronteira

L3B conclui somente criação interna junto de L1/L2/L3A. Demais integrações de
P1/F2-09 e fases restantes continuam obrigatórias. Catálogo/comércio/piloto humano
não são aprovados por fixtures; sem migração ou dados reais.

## Evidência e estado

[Entrega](../../../entregas/2026-10-24-writer-v2-ativacao-atomica-da-criacao-de-lore.md)
e [ADR 0107](../../../decisions/0107-native-book-lore-creation-activation.md):
454 Node e seis SDK distintos positivos em rodadas dirigidas. Revisão corrigiu
a confirmação por recibo isolado quando faltavam os comprovantes do criador.
Arquitetura, sintaxe dos 225 módulos e lint dirigido passaram.

L3B implementado internamente. L1/L2/L3A/L3B cobrem reserva, preparação, cleanup,
composição/auditoria e ativação com sucesso histórico. Exposição ao cliente
continua bloqueada pelos demais passos do plano 81. Writers/consumidores/
backup/cliente/roteamento e ativação de P1 permanecem pendentes.
P1/F2-09/V2 abertos; validate integral no fim de P1; commits somente locais.
