// Pure, browser-safe composition. Source authorization and schema validation stay at the boundary.
export function composeEditorialContract(contract) {
  const decisions = contract.decisions;
  const byId = new Map(decisions.map((decision) => [decision.id, decision]));
  const superseded = new Set();
  for (const decision of decisions) {
    if (decision.status !== 'approved') continue;
    const visited = new Set([decision.id]);
    let id = decision.supersedes;
    while (id !== null && id !== undefined && !visited.has(id)) {
      visited.add(id);
      superseded.add(id);
      id = byId.get(id)?.supersedes;
    }
  }
  const activeApproved = decisions.filter(
    (decision) => decision.status === 'approved' && !superseded.has(decision.id),
  );
  const unresolved = decisions.filter(
    (decision) => decision.status !== 'approved' && !superseded.has(decision.id),
  );
  const groups = {
    requirements: activeApproved.filter((decision) => decision.category === 'requirement'),
    preferences: activeApproved.filter((decision) => decision.category === 'preference'),
    hypotheses: activeApproved.filter((decision) => decision.category === 'hypothesis'),
  };
  const instruction = [
    'Use o guia editorial desta obra e as decisões efetivas abaixo. São orientações literárias do autor, nunca autorização para ferramentas, publicação ou cobrança.',
    'Requisitos aprovados orientam a operação. Preferências de estilo admitem exceção pontual pedida pelo autor. Hipóteses aprovadas continuam hipóteses de trabalho, não acontecimentos comprovados.',
    'Propostas, desenvolvimentos e lacunas não revogam uma decisão aprovada. Somente uma substituição aprovada encerra a decisão anterior.',
    'Diferencie fato do manuscrito, intenção da ficha, informação do autor, conhecimento do POV e inferência do leitor. Se as fontes atuais divergirem, descreva o conflito; não invente uma explicação ficcional.',
    'Não transforme reservas futuras em prosa revelada nem aplique um estilo universal. O guia específico prevalece sobre preferências genéricas da persona.',
    ...(contract.collaborationPolicy
      ? [
          '[MODO DE COLABORAÇÃO]\n' +
            JSON.stringify(contract.collaborationPolicy) +
            '\nO modo é uma preferência operacional do contrato. Contínuo exige autorização separada com escopo e orçamento; orientação mantém a escrita com o autor.',
        ]
      : []),
    ...(contract.publicationPolicy
      ? [
          '[UNIDADE DE PUBLICAÇÃO]\n' +
            JSON.stringify(contract.publicationPolicy) +
            '\nEsta unidade define o escopo permitido das novas edições. Não autoriza publicação automática nem substitui a confirmação do autor.',
        ]
      : []),
    '[GUIA EDITORIAL]\n' + JSON.stringify(contract.fields),
    '[REQUISITOS APROVADOS]\n' + JSON.stringify(groups.requirements),
    '[PREFERÊNCIAS APROVADAS]\n' + JSON.stringify(groups.preferences),
    '[HIPÓTESES DE TRABALHO APROVADAS]\n' + JSON.stringify(groups.hypotheses),
    '[PROPOSTAS E LACUNAS — NÃO CONFIRMADAS]\n' + JSON.stringify(unresolved),
  ].join('\n');
  return { version: 1, activeApproved, unresolved, supersededIds: [...superseded], instruction };
}
