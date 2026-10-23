# ADR 0077 — Histórico por partes na preparação privada

- Status: aceito para implementação interna
- Data: 2026-10-22
- Contexto: P1 M33, depois da ADR 0076

## Problema

Um backup preserva todas as versões, inclusive de recursos removidos. Acumular
o histórico ou gravar uma versão inteira em um documento não atende ao contrato.
A preparação pode ser interrompida antes do manifesto; seus corpos precisam de
prova, retomada e limpeza sem expor a cópia parcial.

## Decisão

advanceBookRestoreHistory permanece interno. O leitor M21 oferece readRawPart
com índice/cursor privados e prova independente por parte. A posição nasce no
ponteiro validado; os passos seguintes conferem cadeia, identidade e número da
parte no mesmo arquivo. O chamador confere item.verify e unit.verify no commit.
Nenhum cursor ou caminho novo é aceito do cliente.

Uma unidade prepara um frame de origem, limitado pelo pacote a 64 KiB.
Corpos usam o contrato UTF-8 de workVersionBodies. SHA incremental
sha256/hash-wasm@4.12.0, posição e contagens ficam no progresso privado.
Hash/bytes integrais são conferidos antes de criar workVersions schema1,
deleting false e resourceKey remapeado. O cursor principal só avança quando a
versão termina. Não carregar todas as versões nem impor limite à sua quantidade.

Texto/BOM, datas, razão e rótulo são preservados; IDs e relações são novos.
wordCount histórico é metadado do snapshot, nunca ledger do manuscrito.
Versão de capítulo/cena removida não recria seu recurso atual. Header e corpos
usam os leitores de histórico existentes; raiz ainda ausente bloqueia a leitura.

Inventário v10 inclui history-version/history-body antes de escrevê-los,
certificando namespaces/journals vazios. São duas famílias planas; cleanup
mascarado/limitado confere nascimento/última alteração e remove também corpos
que ainda não tenham manifesto. Certificação final inclui workVersions e
workVersionBodies. Recursos de outra cópia e encarnações recriadas são preservados.
Inventários v1–v9 e recibos antigos continuam válidos.

Preparação v7 fixa startIndex e totais de versões/bytes/partes de origem/corpos
nativos. work-history confere manifesto e relatório validado antes de draft.
Cancelamento pode ocorrer em qualquer parte, mantendo checkpoint/recibo atômicos.

## Consequências e limites

O histórico fica preparado, ainda sem raiz/countReady. Hash final confere bytes
da origem; a certificação integral dos artefatos antes da ativação continua
obrigatória, inclusive para detectar alteração posterior de uma parte preparada.
A raiz sintética nos testes prova somente compatibilidade do leitor.

Campos grandes, inclusive rótulos além do envelope nativo, falham intactos.
Sua representação integral continua obrigatória em P1; não redefinir o suporte
para somente os casos que cabem em documentos atuais. Faltam rascunho/capa,
integração de personas, campos grandes/consumidores, certificação/ativação,
host/UI/roundtrip e validate integral. P1/F2-09 e Writer V2 seguem abertos.
Sem API pública, Rule, dependência, crédito, subagentes, CI/push/PR/deploy novos.
