import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Dialog, Input, Select, Textarea } from '@/shared/ui';
import {
  LORE_CATEGORIES,
  type CreateLoreEntityInput,
  type LoreCategory,
  type LoreEntity,
  type LoreRelation,
} from '../model/loreEntity';
import styles from './LoreEntityForm.module.css';

export interface LoreEntityFormProps {
  open: boolean;
  initialName?: string;
  entityToEdit?: LoreEntity | null;
  allEntities: LoreEntity[];
  onClose: () => void;
  onSubmit: (input: CreateLoreEntityInput) => Promise<void>;
}

interface FormContentProps {
  initialName?: string;
  entityToEdit?: LoreEntity | null;
  allEntities: LoreEntity[];
  onClose: () => void;
  onSubmit: (input: CreateLoreEntityInput) => Promise<void>;
}

function LoreEntityFormContent({
  entityToEdit,
  allEntities,
  onClose,
  onSubmit,
  initialName = '',
}: FormContentProps) {
  const [name, setName] = useState(entityToEdit?.name ?? initialName);
  const [category, setCategory] = useState<LoreCategory>(entityToEdit?.category ?? 'character');
  const [aliasesText, setAliasesText] = useState(
    entityToEdit?.aliases ? entityToEdit.aliases.join(', ') : '',
  );
  const [summary, setSummary] = useState(entityToEdit?.summary ?? '');
  const [details, setDetails] = useState(entityToEdit?.details ?? '');
  const [isPublic, setIsPublic] = useState(entityToEdit?.isPublic ?? true);
  const [relations, setRelations] = useState<LoreRelation[]>(
    entityToEdit?.relations ? [...entityToEdit.relations] : [],
  );
  const [structuredDetails, setStructuredDetails] = useState(
    entityToEdit?.structuredDetails ?? { appearance: '', personality: '', history: '', notes: '' },
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Entidades elegíveis para relação (exclui a própria entidade sendo editada)
  const availableTargetEntities = allEntities.filter(
    (e) => !entityToEdit || e.id !== entityToEdit.id,
  );

  const handleAddRelation = () => {
    if (availableTargetEntities.length === 0) return;
    const firstTarget = availableTargetEntities[0];
    if (!firstTarget) return;

    setRelations((prev) => [
      ...prev,
      {
        targetEntityId: firstTarget.id,
        relationType: 'Relacionado com',
        description: '',
      },
    ]);
  };

  const handleUpdateRelation = (index: number, field: keyof LoreRelation, value: string) => {
    setRelations((prev) => prev.map((rel, i) => (i === index ? { ...rel, [field]: value } : rel)));
  };

  const handleRemoveRelation = (index: number) => {
    setRelations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !summary.trim()) return;

    const parsedAliases = aliasesText
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    setError(null);
    setIsSubmitting(true);
    void (async () => {
      try {
        await onSubmit({
          name: name.trim(),
          category,
          aliases: parsedAliases,
          summary: summary.slice(0, 140).trim(),
          details: details.trim(),
          relations,
          structuredDetails,
          isPublic,
        });
        onClose();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível salvar a ficha. Tente novamente.',
        );
      } finally {
        setIsSubmitting(false);
      }
    })();
  };

  const dialogTitle = entityToEdit
    ? `Editar Entidade: ${entityToEdit.name}`
    : 'Cadastrar Nova Entidade no Compêndio';

  const categoryOptions = LORE_CATEGORIES.map((c) => ({
    value: c.value,
    label: c.label,
  }));

  const targetEntityOptions = availableTargetEntities.map((e) => ({
    value: e.id,
    label: `${e.name} (${e.category})`,
  }));

  return (
    <Dialog
      open={true}
      title={dialogTitle}
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="lore-entity-form"
            variant="primary"
            disabled={isSubmitting || !name.trim() || !summary.trim()}
          >
            {entityToEdit ? 'Salvar Alterações' : 'Cadastrar Entidade'}
          </Button>
        </div>
      }
    >
      <form id="lore-entity-form" onSubmit={handleSubmit} className={styles.form}>
        {error && (
          <Alert variant="destructive" title="Falha ao salvar">
            {error}
          </Alert>
        )}
        <div className={styles.row}>
          <div className={styles.colName}>
            <Input
              label="Nome da Entidade"
              placeholder="Ex: Rei Arthur, Floresta Proibida, Espada Excalibur"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSubmitting}
            />
          </div>
          <div className={styles.colCategory}>
            <Select
              label="Categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value as LoreCategory)}
              options={categoryOptions}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <Input
          label="Apelidos / Aliases (separados por vírgula)"
          placeholder="Ex: O Rei Supremo, Pendragon, Artorius"
          value={aliasesText}
          onChange={(e) => setAliasesText(e.target.value)}
          hint="Esses termos também serão reconhecidos e destacados automaticamente no texto."
          disabled={isSubmitting}
        />

        <div>
          <Textarea
            label="Resumo Curto (exibido nos tooltips de leitura e edição)"
            placeholder="Resumo objetivo de quem é, o que faz ou qual seu significado na trama..."
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            required
            maxLength={140}
            hint={`${summary.length}/140 caracteres`}
            disabled={isSubmitting}
          />
        </div>

        <Textarea
          label="Ficha Detalhada / Lore Completo (opcional)"
          placeholder="História pregressa, aparência física, motivações, características psicológicas, segredos, etc."
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={5}
          disabled={isSubmitting}
        />

        {(
          [
            ['appearance', 'Aparência'],
            ['personality', 'Personalidade'],
            ['history', 'Histórico'],
            ['notes', 'Notas privadas'],
          ] as const
        ).map(([field, label]) => (
          <Textarea
            key={field}
            label={label}
            value={structuredDetails[field]}
            onChange={(event) =>
              setStructuredDetails((previous) => ({ ...previous, [field]: event.target.value }))
            }
            rows={3}
            disabled={isSubmitting}
          />
        ))}
        <p>
          Somente nome, apelidos, categoria e resumo podem aparecer no leitor público. A ficha
          detalhada, relações e notas permanecem privadas.
        </p>
        {entityToEdit?.isPublic && !isPublic && (
          <Alert variant="warning" title="A publicação será retirada">
            Tornar esta entidade privada também retira a publicação atual da obra para revogar o
            acesso ao resumo. Você poderá publicar uma nova versão sem esta entidade.
          </Alert>
        )}
        <div className={styles.visibilityToggle}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
              disabled={isSubmitting}
              className={styles.checkbox}
            />
            <span>Tornar visível no leitor público da obra</span>
          </label>
        </div>

        <div className={styles.relationsSection}>
          <div className={styles.relationsHeader}>
            <div>
              <strong className={styles.relationsTitle}>Relações com Outras Entidades</strong>
              <p className={styles.relationsSubtitle}>
                Conecte esta entidade com outros personagens, locais ou conceitos da história.
              </p>
            </div>
            {availableTargetEntities.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={handleAddRelation}
                disabled={isSubmitting}
                title="Adicionar relação"
              >
                <Plus className="icon icon-sm" aria-hidden="true" />
                Adicionar Relação
              </Button>
            )}
          </div>

          {availableTargetEntities.length === 0 && (
            <p className={styles.emptyNotice}>
              Cadastre outras entidades no livro para vinculá-las em relações.
            </p>
          )}

          {relations.length > 0 && (
            <div className={styles.relationsList}>
              {relations.map((rel, index) => (
                <div key={index} className={styles.relationRow}>
                  <div className={styles.relSelect}>
                    <Select
                      label="Entidade Vinculada"
                      value={rel.targetEntityId}
                      onChange={(e) =>
                        handleUpdateRelation(index, 'targetEntityId', e.target.value)
                      }
                      options={targetEntityOptions}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className={styles.relType}>
                    <Input
                      label="Tipo de Relação"
                      placeholder="Ex: Aliado de, Rival de, Governante de"
                      value={rel.relationType}
                      onChange={(e) => handleUpdateRelation(index, 'relationType', e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                  <Textarea
                    label="Descrição da Relação"
                    value={rel.description ?? ''}
                    onChange={(event) =>
                      handleUpdateRelation(index, 'description', event.target.value)
                    }
                    disabled={isSubmitting}
                    rows={2}
                  />
                  <div className={styles.relRemove}>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => handleRemoveRelation(index)}
                      disabled={isSubmitting}
                      title="Remover relação"
                      aria-label="Remover relação"
                    >
                      <Trash2 className="icon icon-sm" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </Dialog>
  );
}

export function LoreEntityForm({
  open,
  initialName,
  entityToEdit,
  allEntities,
  onClose,
  onSubmit,
}: LoreEntityFormProps) {
  if (!open) return null;

  return (
    <LoreEntityFormContent
      key={entityToEdit ? entityToEdit.id : 'new-entity'}
      initialName={initialName}
      entityToEdit={entityToEdit}
      allEntities={allEntities}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}
