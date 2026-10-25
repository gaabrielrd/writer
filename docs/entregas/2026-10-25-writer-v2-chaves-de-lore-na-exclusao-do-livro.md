# Writer V2 — chaves de lore na exclusão do livro

- Data: 2026-10-25.
- Plano: [126](../tasks/writer-v2/execucao/126-ciclo-das-chaves-na-exclusao-do-livro.md), P1 / M38c7.
- Decisão: [ADR 0145](../decisions/0145-book-lore-recovery-key-deletion.md).
- Estado: implementado e validado localmente; P1 e Writer V2 continuam abertos.

## Objetivo e funcionalidades

A exclusão integral do livro agora revoga as chaves de recuperação de lore
da encarnação original antes de remover a raiz. Recuperações de criação e
edição são visitadas por unidades, incluindo controles antigos sem índice.
Recibos, provas, fences e metadata permanecem para confirmar pedidos históricos.

Novas reservas criam inventário privado imutável no mesmo commit da chave e
reserva. Liberação e revogação exigem o índice original quando declarado.
Nenhuma chave ou índice ausente é regenerado por replay. Recriações e resíduos
divergentes bloqueiam a operação e são preservados para reconciliação.

Estado v1 da exclusão é verificado antes de migrar para v2, preservando fase,
corpo, cursor, contadores e aliases. Controladores de lore já completos também
passam pela revogação se a raiz do livro ainda existe. Os dois finish exigem
inventário vazio; índice órfão/tardio impede remover a raiz.

## Critérios e arquivos

- [x] Reserva/prova/chave/índice atômicos, sem alteração do manuscrito ou créditos.
- [x] Controles antigos compatíveis, sem índice fabricado.
- [x] Uma recuperação por unidade, com identidade nativa e cutoff.
- [x] Revogação, deletes e checkpoints no mesmo commit.
- [x] Coleta lê da chave somente schema/timestamps, sem keyBase64 ou prosa.
- [x] Estado v1 avançado/completo migrado sem pular chaves.
- [x] Sem flags, chave ausente, origem ausente, outros livros/UIDs preservados.
- [x] Recriação, rollback e bloqueio de resíduo desconhecido conferidos.
- [x] SDK privado negado e controles positivos nativos mantidos.

Store/Inventory de recuperação, serviço de chave e novo RecoveryDeletion;
Deletion/Store; Rules; testes Node e SDK; plano, ADR, AGENTS, arquitetura,
testes e registros de execução. Respostas públicas, RPCs, journal/ciphertext
do navegador, UI, endpoints e dependências não mudaram.

## Testes e resultados reais

**85 casos Node distintos positivos**, sem skipped:

- bookLoreRecoveryDeletion: 26 novos, incluindo 20 recuperações paginadas,
  criação, legado, encarnação, resíduo, cutoff, v1 completo, rollback e guard.
- bookLoreDeletion: 23 regressões, incluindo corpos acima de 128 partes,
  cancelamentos coordenados, aliases, migração e identidades nativas.
- bookLoreWriteRecovery: 30 regressões de reserva, liberação de chave pelo serviço,
  prova/CAS/origem, cancelamento, fingerprint, falhas e permanência de metadata.
- bookLoreWriteRecoveryHttp: seis, incluindo servidor HTTP real, Auth/App Check,
  sanitização e no-store.

**12 SDK nativos positivos em duas famílias**, sem skipped:

- bookLoreWriteRecovery.rules: sete, em 62544,3034 ms. Inclui dois novos:
  exclusão de chaves indexadas/legadas no mesmo fluxo, preservação de outro
  livro e rollback no último write do checkpoint. A matriz de denies cobre
  também o novo índice para dono, outro usuário e anônimo.
- bookLoreDeletion.rules: cinco regressões, em 149859,2842 ms. Adoção, aliases,
  cancelamentos parciais, mais de 128 partes e recriações de corpo/parte.

Firestore Emulator 1.22.0, JAR verificado por SHA-256, projeto demo e loopback;
sem credenciais ou chamadas de produção. As mensagens PERMISSION_DENIED
correspondem a assertFails esperados. Artefatos fora do Git:
writer-v2-portability-qa/m38c7-node.tap, m38c7-sdk.tap e log do emulador.

A primeira extração do store deixou de importar createHash; os testes apontaram
ReferenceError. O import foi corrigido e as regressões passaram antes da
integração da exclusão. Nenhum teste foi ignorado ou limite reduzido.

## Checks e limites

Sintaxe dos 258 módulos Functions, lint dirigido, arquitetura, documentação,
formatação e diff positivos. Não foi necessário repetir build/browser/Vitest:
a alteração é de backend/Rules e foi exercitada por Node/SDK reais. Validate
integral fica no fechamento de P1, conforme orientação do operador.
Somente commit local; sem CI, push, PR, merge ou deploy.

O novo inventário e a liberação/remoção devem ser implantados conjuntamente
com Rules e drain dos produtores anteriores. Este marco não autoriza rollout.
Chaves de livros já apagados antes desse fluxo ainda exigem auditoria própria;
não há purge automático nem identidade da raiz inventada.

Cópias locais não são apagadas remotamente. Reabertura pelo Writer exige
autorização/chave atuais; material já autorizado em memória não pode ser
apagado remotamente. Exclusão de uma ficha isolada não é este protocolo.

Demais namespaces de exclusão, escritores/consumidores, backup/restauração,
rollout/drain/validate de P1, fases 3–5 e gates humanos/comerciais continuam
necessários. O protocolo não declara o inventário completo de P1 concluído.

## Como verificar

Nos testes dirigidos, reserve recuperação, marque o livro deleting e avance
a exclusão com o mesmo pedido. Observe terminal/prova, chave e índice removidos
no commit do checkpoint, metadata histórica revogada e raiz removida só ao fim.
Recriar chave/índice ou introduzir resíduo órfão deve impedir a finalização.
