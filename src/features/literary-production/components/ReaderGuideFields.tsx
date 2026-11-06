import { Button, Dropdown, Input, Textarea } from '@/shared/ui';
import type {
  ReaderGuideDraft,
  PublicationChapter,
  GuideEntry,
  GuideCertainty,
} from '../services/literaryPublicationService';
import styles from './EditorialContractPanel.module.css';
export function ReaderGuideFields({
  value,
  onChange,
  disabled,
  chapters,
  targets,
  onPreview,
  legend = 'Entrada do guia',
}: {
  value: ReaderGuideDraft;
  onChange: (value: ReaderGuideDraft) => void;
  disabled: boolean;
  chapters: PublicationChapter[];
  targets: GuideEntry[];
  onPreview: (id: string) => void;
  legend?: string;
}) {
  const update = (next: ReaderGuideDraft) => {
    if (!disabled) onChange(next);
  };
  const chapterOptions = (id: string) => [
    { value: '', label: 'Escolha um capítulo' },
    ...chapters.map((item) => ({ value: item.chapterId, label: item.title })),
    ...(id && !chapters.some((item) => item.chapterId === id)
      ? [{ value: id, label: 'Capítulo vinculado — carregue mais capítulos' }]
      : []),
  ];
  const targetOptions = (id: string) => [
    { value: '', label: 'Escolha uma identidade' },
    ...targets
      .filter((item) => item.guide)
      .map((item) => ({
        value: item.id,
        label:
          item.guide!.name + (item.guide!.disambiguation ? ' · ' + item.guide!.disambiguation : ''),
      })),
    ...(id && !targets.some((item) => item.id === id)
      ? [{ value: id, label: 'Identidade vinculada — carregue mais entradas' }]
      : []),
  ];
  const certaintyOptions = [
    { value: 'fact', label: 'Fato apresentado no texto' },
    { value: 'uncertain', label: 'Informação incerta' },
  ];
  return (
    <fieldset disabled={disabled} className={styles.guideFields}>
      <legend>{legend}</legend>
      <Input
        label="Nome público"
        value={value.name}
        maxLength={200}
        onChange={(event) => update({ ...value, name: event.target.value })}
      />
      <Input
        label="Distinção entre homônimos"
        value={value.disambiguation}
        maxLength={140}
        onChange={(event) => update({ ...value, disambiguation: event.target.value })}
      />
      <Textarea
        label="Apelidos e grafias — um por linha"
        value={value.aliases.join('\n')}
        onChange={(event) => update({ ...value, aliases: event.target.value.split('\n') })}
      />
      <Dropdown
        mode="select"
        disabled={disabled}
        label="Categoria pública"
        value={value.category}
        options={[
          { value: 'character', label: 'Pessoa ou personagem' },
          { value: 'location', label: 'Lugar' },
          { value: 'concept', label: 'Conceito' },
          { value: 'other', label: 'Outro' },
        ]}
        onValueChange={(category) =>
          update({ ...value, category: category as ReaderGuideDraft['category'] })
        }
      />
      <Textarea
        label="Resumo público"
        value={value.summary}
        maxLength={140}
        onChange={(event) => update({ ...value, summary: event.target.value })}
      />
      <Dropdown
        mode="select"
        disabled={disabled}
        label="Certeza do resumo"
        value={value.certainty}
        options={certaintyOptions}
        onValueChange={(certainty) => update({ ...value, certainty: certainty as GuideCertainty })}
      />
      <Dropdown
        mode="select"
        disabled={disabled}
        label="Liberar a entrada a partir do capítulo"
        value={value.revealAfterChapterId}
        options={chapterOptions(value.revealAfterChapterId)}
        onValueChange={(revealAfterChapterId) => update({ ...value, revealAfterChapterId })}
      />
      <h4>Fontes do resumo</h4>
      {value.evidence.map((item, index) => (
        <div key={index} className={styles.decisionForm}>
          <Dropdown
            mode="select"
            disabled={disabled}
            label={'Capítulo da fonte ' + (index + 1)}
            value={item.chapterId}
            options={chapterOptions(item.chapterId)}
            onValueChange={(chapterId) =>
              update({
                ...value,
                evidence: value.evidence.map((v, i) => (i === index ? { ...v, chapterId } : v)),
              })
            }
          />
          <Button
            variant="outline"
            disabled={disabled || !item.chapterId}
            onClick={() => onPreview(item.chapterId)}
          >
            Ver texto da fonte {index + 1}
          </Button>
          <Textarea
            label={'Citação literal do resumo ' + (index + 1)}
            value={item.quote}
            maxLength={1500}
            onChange={(event) =>
              update({
                ...value,
                evidence: value.evidence.map((v, i) =>
                  i === index ? { ...v, quote: event.target.value } : v,
                ),
              })
            }
          />
          {value.evidence.length > 1 && (
            <Button
              variant="ghost"
              onClick={() =>
                update({ ...value, evidence: value.evidence.filter((_, i) => i !== index) })
              }
            >
              Remover fonte {index + 1}
            </Button>
          )}
        </div>
      ))}
      <Button
        variant="outline"
        disabled={disabled || value.evidence.length >= 8}
        onClick={() =>
          update({ ...value, evidence: [...value.evidence, { chapterId: '', quote: '' }] })
        }
      >
        Adicionar fonte do resumo
      </Button>
      <h4>Fatos com revelação própria</h4>
      {value.facts.map((item, index) => (
        <div key={index} className={styles.decisionForm}>
          <Textarea
            label={'Fato público ' + (index + 1)}
            value={item.text}
            maxLength={300}
            onChange={(event) =>
              update({
                ...value,
                facts: value.facts.map((v, i) =>
                  i === index ? { ...v, text: event.target.value } : v,
                ),
              })
            }
          />
          <Dropdown
            mode="select"
            disabled={disabled}
            label={'Certeza do fato ' + (index + 1)}
            value={item.certainty}
            options={certaintyOptions}
            onValueChange={(certainty) =>
              update({
                ...value,
                facts: value.facts.map((v, i) =>
                  i === index ? { ...v, certainty: certainty as GuideCertainty } : v,
                ),
              })
            }
          />
          <Dropdown
            mode="select"
            disabled={disabled}
            label={'Capítulo do fato ' + (index + 1)}
            value={item.chapterId}
            options={chapterOptions(item.chapterId)}
            onValueChange={(chapterId) =>
              update({
                ...value,
                facts: value.facts.map((v, i) => (i === index ? { ...v, chapterId } : v)),
              })
            }
          />
          <Button
            variant="outline"
            disabled={disabled || !item.chapterId}
            onClick={() => onPreview(item.chapterId)}
          >
            Ver fonte do fato {index + 1}
          </Button>
          <Textarea
            label={'Citação do fato ' + (index + 1)}
            value={item.quote}
            maxLength={1500}
            onChange={(event) =>
              update({
                ...value,
                facts: value.facts.map((v, i) =>
                  i === index ? { ...v, quote: event.target.value } : v,
                ),
              })
            }
          />
          <Button
            variant="ghost"
            onClick={() => update({ ...value, facts: value.facts.filter((_, i) => i !== index) })}
          >
            Remover fato {index + 1}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={disabled || value.facts.length >= 12}
        onClick={() =>
          update({
            ...value,
            facts: [...value.facts, { text: '', certainty: 'fact', chapterId: '', quote: '' }],
          })
        }
      >
        Adicionar fato público
      </Button>
      <h4>Relações</h4>
      {value.relationships.map((item, index) => (
        <div key={index} className={styles.decisionForm}>
          <Dropdown
            mode="select"
            disabled={disabled}
            label={'Identidade relacionada ' + (index + 1)}
            value={item.targetId}
            options={targetOptions(item.targetId)}
            onValueChange={(targetId) =>
              update({
                ...value,
                relationships: value.relationships.map((v, i) =>
                  i === index ? { ...v, targetId } : v,
                ),
              })
            }
          />
          <Textarea
            label={'Relação pública ' + (index + 1)}
            value={item.description}
            maxLength={300}
            onChange={(event) =>
              update({
                ...value,
                relationships: value.relationships.map((v, i) =>
                  i === index ? { ...v, description: event.target.value } : v,
                ),
              })
            }
          />
          <Dropdown
            mode="select"
            disabled={disabled}
            label={'Certeza da relação ' + (index + 1)}
            value={item.certainty}
            options={certaintyOptions}
            onValueChange={(certainty) =>
              update({
                ...value,
                relationships: value.relationships.map((v, i) =>
                  i === index ? { ...v, certainty: certainty as GuideCertainty } : v,
                ),
              })
            }
          />
          <Dropdown
            mode="select"
            disabled={disabled}
            label={'Capítulo da relação ' + (index + 1)}
            value={item.chapterId}
            options={chapterOptions(item.chapterId)}
            onValueChange={(chapterId) =>
              update({
                ...value,
                relationships: value.relationships.map((v, i) =>
                  i === index ? { ...v, chapterId } : v,
                ),
              })
            }
          />
          <Button
            variant="outline"
            disabled={disabled || !item.chapterId}
            onClick={() => onPreview(item.chapterId)}
          >
            Ver fonte da relação {index + 1}
          </Button>
          <Textarea
            label={'Citação da relação ' + (index + 1)}
            value={item.quote}
            maxLength={1500}
            onChange={(event) =>
              update({
                ...value,
                relationships: value.relationships.map((v, i) =>
                  i === index ? { ...v, quote: event.target.value } : v,
                ),
              })
            }
          />
          <Button
            variant="ghost"
            onClick={() =>
              update({ ...value, relationships: value.relationships.filter((_, i) => i !== index) })
            }
          >
            Remover relação {index + 1}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={disabled || value.relationships.length >= 12}
        onClick={() =>
          update({
            ...value,
            relationships: [
              ...value.relationships,
              { targetId: '', description: '', certainty: 'fact', chapterId: '', quote: '' },
            ],
          })
        }
      >
        Adicionar relação
      </Button>
      <h4>Aparições e menções</h4>
      {value.appearances.map((item, index) => (
        <div key={index} className={styles.decisionForm}>
          <Dropdown
            mode="select"
            disabled={disabled}
            label={'Tipo da aparição ' + (index + 1)}
            value={item.kind}
            options={[
              { value: 'direct', label: 'Presença direta' },
              { value: 'document', label: 'Transmissão documental' },
              { value: 'mention', label: 'Menção' },
              { value: 'uncertain', label: 'Presença incerta' },
            ]}
            onValueChange={(kind) =>
              update({
                ...value,
                appearances: value.appearances.map((v, i) =>
                  i === index ? { ...v, kind: kind as typeof item.kind } : v,
                ),
              })
            }
          />
          <Dropdown
            mode="select"
            disabled={disabled}
            label={'Capítulo da aparição ' + (index + 1)}
            value={item.chapterId}
            options={chapterOptions(item.chapterId)}
            onValueChange={(chapterId) =>
              update({
                ...value,
                appearances: value.appearances.map((v, i) =>
                  i === index ? { ...v, chapterId } : v,
                ),
              })
            }
          />
          <Button
            variant="outline"
            disabled={disabled || !item.chapterId}
            onClick={() => onPreview(item.chapterId)}
          >
            Ver fonte da aparição {index + 1}
          </Button>
          <Textarea
            label={'Citação da aparição ' + (index + 1)}
            value={item.quote}
            maxLength={1500}
            onChange={(event) =>
              update({
                ...value,
                appearances: value.appearances.map((v, i) =>
                  i === index ? { ...v, quote: event.target.value } : v,
                ),
              })
            }
          />
          <Button
            variant="ghost"
            onClick={() =>
              update({ ...value, appearances: value.appearances.filter((_, i) => i !== index) })
            }
          >
            Remover aparição {index + 1}
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        disabled={disabled || value.appearances.length >= 24}
        onClick={() =>
          update({
            ...value,
            appearances: [...value.appearances, { kind: 'direct', chapterId: '', quote: '' }],
          })
        }
      >
        Adicionar aparição ou menção
      </Button>
    </fieldset>
  );
}
