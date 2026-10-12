import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Dialog, Input, Dropdown, Textarea, FormSection } from '@/shared/ui';
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
  global?: boolean;
  privateOnly?: boolean;
  onClose: () => void;
  onSubmit: (input: CreateLoreEntityInput) => Promise<void>;
}

function LoreEntityFormContent({
  entityToEdit,
  allEntities,
  onClose,
  onSubmit,
  initialName = '',
  global = false,
  privateOnly = false,
}: Omit<LoreEntityFormProps, 'open'>) {
  const [relationsOpen, setRelationsOpen] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  const [creationId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState(entityToEdit?.name ?? initialName);
  const [category, setCategory] = useState<LoreCategory>(entityToEdit?.category ?? 'character');
  const [aliasesText, setAliasesText] = useState(entityToEdit?.aliases.join(', ') ?? '');
  const [summary, setSummary] = useState(entityToEdit?.summary ?? '');
  const [details, setDetails] = useState(entityToEdit?.details ?? '');
  const [isPublic, setIsPublic] = useState(entityToEdit?.isPublic ?? true);
  const [relations, setRelations] = useState<LoreRelation[]>(
    entityToEdit?.relations ? [...entityToEdit.relations] : [],
  );
  const [relationIndex, setRelationIndex] = useState(0);
  const [structuredDetails, setStructuredDetails] = useState({
    appearance: '',
    personality: '',
    history: '',
    notes: '',
    ...entityToEdit?.structuredDetails,
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const globalScope = global || Boolean(entityToEdit?.universeId);
  const available = allEntities.filter(
    (item) => item.id !== entityToEdit?.id && (!globalScope || Boolean(item.universeId)),
  );
  const aliases = aliasesText
    .split(',')
    .map((alias) => alias.trim())
    .filter(Boolean);
  const validIdentification = Boolean(
    name.trim() &&
    summary.trim() &&
    summary.length <= 140 &&
    name.length <= 200 &&
    aliases.length <= 20 &&
    aliases.every((alias) => alias.length <= 200),
  );
  const relation = relations[relationIndex];
  const validRelations = relations.every((item) => item.targetEntityId && item.relationType.trim());
  function close() {
    if (!submitLock.current) onClose();
  }
  function updateRelation(field: keyof LoreRelation, value: string) {
    setRelations((previous) =>
      previous.map((item, index) => (index === relationIndex ? { ...item, [field]: value } : item)),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitLock.current || isSubmitting) return;
    if (!validIdentification) {
      setError('Preencha nome e resumo; use até 20 apelidos de até 200 caracteres.');
      return;
    }
    if (!validRelations) {
      setRelationsOpen(true);
      setRelationIndex(
        relations.findIndex((item) => !item.targetEntityId || !item.relationType.trim()),
      );
      setError('Selecione o destino e informe o tipo de cada relação.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    submitLock.current = true;
    try {
      await onSubmit({
        ...(entityToEdit ? {} : { creationId }),
        name: name.trim(),
        category,
        aliases,
        summary: summary.trim(),
        details: details.trim(),
        structuredDetails,
        relations,
        isPublic: privateOnly ? false : isPublic,
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
      submitLock.current = false;
    }
  }
  const title = entityToEdit
    ? `Editar Entidade: ${entityToEdit.name}`
    : 'Cadastrar Nova Entidade no Compêndio';
  return (
    <Dialog
      open
      title={title}
      maxWidthClass="max-w-2xl"
      description={`${globalScope ? 'Lore global · universo compartilhado' : 'Lore local · somente este livro'}. Nome e resumo são obrigatórios; complete o restante quando precisar.`}
      onClose={close}
      footer={
        <div className={styles.footer}>
          <Button type="button" variant="secondary" onClick={close} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="lore-entity-form"
            disabled={isSubmitting || !validIdentification}
          >
            {isSubmitting
              ? 'Salvando...'
              : entityToEdit
                ? 'Salvar Alterações'
                : 'Cadastrar Entidade'}
          </Button>
        </div>
      }
    >
      <form
        id="lore-entity-form"
        className={styles.form}
        aria-busy={isSubmitting}
        onSubmit={(event) => void submit(event)}
      >
        {globalScope && (
          <p className={styles.scopeNotice}>
            Esta entidade pertence ao universo e é compartilhada com outros livros.
          </p>
        )}
        {error && (
          <Alert ref={errorRef} tabIndex={-1} variant="destructive" title="Falha ao salvar">
            {error}
          </Alert>
        )}
        {
          <>
            <div className={styles.identification}>
              <Input
                label="Nome da Entidade"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                required
                disabled={isSubmitting}
              />
              <Dropdown
                mode="select"
                label="Categoria"
                value={category}
                onValueChange={(nextValue) => setCategory(nextValue as LoreCategory)}
                options={LORE_CATEGORIES}
                disabled={isSubmitting}
              />
            </div>
            <Input
              label="Apelidos / Aliases"
              value={aliasesText}
              onChange={(event) => setAliasesText(event.target.value)}
              disabled={isSubmitting}
              hint="Até 20 termos de 200 caracteres, separados por vírgulas. Também reconhecidos no texto."
            />
            <Textarea
              label="Resumo Curto"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              maxLength={140}
              required
              disabled={isSubmitting}
              hint={`${summary.length}/140 caracteres · exibido nos tooltips de leitura e edição`}
            />
          </>
        }
        <div className={styles.visibility}>
          <p>
            No leitor público: nome, apelidos, categoria e resumo. Detalhes, relações e notas ficam
            privados.
          </p>
          {entityToEdit?.isPublic && !isPublic && (
            <Alert variant="warning" title="A publicação será retirada">
              {globalScope
                ? 'As publicações dos livros deste universo ficarão indisponíveis até uma nova publicação sem esta entidade.'
                : 'A publicação atual da obra será retirada para revogar o acesso ao resumo. Você poderá publicar uma nova versão sem esta entidade.'}
            </Alert>
          )}
          {privateOnly ? (
            <p>Esta ficha será criada como lore privado do livro.</p>
          ) : (
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
                disabled={isSubmitting}
                className={styles.checkbox}
              />
              <span>Tornar visível no leitor público da obra</span>
            </label>
          )}
        </div>
        <FormSection
          title="Características"
          description="Aparência e personalidade · privado"
          disabled={isSubmitting}
        >
          {(['appearance', 'personality'] as const).map((field) => (
            <Textarea
              key={field}
              label={field === 'appearance' ? 'Aparência' : 'Personalidade'}
              value={structuredDetails[field]}
              onChange={(event) =>
                setStructuredDetails((previous) => ({ ...previous, [field]: event.target.value }))
              }
              rows={3}
              maxLength={150000}
              disabled={isSubmitting}
            />
          ))}
        </FormSection>
        <FormSection
          title="História e notas"
          description="Ficha detalhada e anotações · privado"
          disabled={isSubmitting}
        >
          {
            <>
              <Textarea
                label="Ficha Detalhada / Lore Completo (opcional)"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                rows={3}
                maxLength={150000}
                disabled={isSubmitting}
              />
              {(['history', 'notes'] as const).map((field) => (
                <Textarea
                  key={field}
                  label={field === 'history' ? 'Histórico' : 'Notas privadas'}
                  value={structuredDetails[field]}
                  onChange={(event) =>
                    setStructuredDetails((previous) => ({
                      ...previous,
                      [field]: event.target.value,
                    }))
                  }
                  rows={3}
                  maxLength={150000}
                  disabled={isSubmitting}
                />
              ))}
            </>
          }
        </FormSection>
        <FormSection
          title="Relações"
          description={`${relations.length} ${relations.length === 1 ? 'vínculo' : 'vínculos'} · privado`}
          open={relationsOpen}
          onOpenChange={setRelationsOpen}
          disabled={isSubmitting}
        >
          {
            <>
              <div className={styles.relationsHeader}>
                <strong>Relações com Outras Entidades</strong>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSubmitting || available.length === 0 || relations.length >= 50}
                  onClick={() => {
                    const target = available[0];
                    if (target) {
                      setRelationIndex(relations.length);
                      setRelations((previous) => [
                        ...previous,
                        {
                          targetEntityId: target.id,
                          relationType: 'Relacionado com',
                          description: '',
                        },
                      ]);
                    }
                  }}
                >
                  <Plus className="icon icon-sm" aria-hidden="true" />
                  Adicionar Relação
                </Button>
              </div>
              {!available.length && (
                <p className={styles.scopeNotice}>
                  Cadastre outras entidades neste escopo para vinculá-las em relações.
                </p>
              )}
              {relation && (
                <>
                  {relations.length > 1 && (
                    <Dropdown
                      mode="select"
                      label="Relação em edição"
                      value={relationIndex}
                      onValueChange={(nextValue) => setRelationIndex(Number(nextValue))}
                      options={relations.map((item, index) => ({
                        value: index,
                        label: `${index + 1}. ${available.find((target) => target.id === item.targetEntityId)?.name ?? 'Entidade não disponível'}`,
                      }))}
                      disabled={isSubmitting}
                    />
                  )}
                  <Dropdown
                    mode="select"
                    searchable
                    label="Entidade Vinculada"
                    value={relation.targetEntityId}
                    onValueChange={(nextValue) => updateRelation('targetEntityId', nextValue)}
                    options={[
                      ...available.map((item) => ({
                        value: item.id,
                        label: `${item.name} (${item.universeId ? 'Global' : 'Local'})`,
                      })),
                      ...(!available.some((item) => item.id === relation.targetEntityId)
                        ? [{ value: relation.targetEntityId, label: 'Entidade não disponível' }]
                        : []),
                    ]}
                    disabled={isSubmitting}
                  />
                  <Input
                    label="Tipo de Relação"
                    value={relation.relationType}
                    onChange={(event) => updateRelation('relationType', event.target.value)}
                    maxLength={200}
                    disabled={isSubmitting}
                  />
                  <Textarea
                    label="Descrição da Relação"
                    value={relation.description ?? ''}
                    onChange={(event) => updateRelation('description', event.target.value)}
                    maxLength={4000}
                    rows={2}
                    disabled={isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    aria-label="Remover relação"
                    disabled={isSubmitting}
                    onClick={() => {
                      setRelations((previous) =>
                        previous.filter((_, index) => index !== relationIndex),
                      );
                      setRelationIndex(Math.max(0, relationIndex - 1));
                    }}
                  >
                    <Trash2 className="icon icon-sm" aria-hidden="true" />
                    Remover relação
                  </Button>
                </>
              )}
            </>
          }
        </FormSection>
        {isSubmitting && <p role="status">Salvando sua ficha...</p>}
      </form>
    </Dialog>
  );
}
export function LoreEntityForm({ open, ...props }: LoreEntityFormProps) {
  return open ? (
    <LoreEntityFormContent
      key={props.entityToEdit?.id ?? props.initialName ?? 'new-entity'}
      {...props}
    />
  ) : null;
}
