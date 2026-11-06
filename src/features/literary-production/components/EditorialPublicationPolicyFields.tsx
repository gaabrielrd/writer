import { Dropdown } from '@/shared/ui';
import {
  publicationUnitLabels,
  type EditorialContract,
  type LiteraryPublicationUnit,
} from '../model/editorial';

export function EditorialPublicationPolicyFields({
  value,
  disabled,
  onChange,
}: {
  value: EditorialContract;
  disabled: boolean;
  onChange: (contract: EditorialContract) => void;
}) {
  return (
    <div>
      <Dropdown
        mode="select"
        label="Unidade de publicação do contrato"
        disabled={disabled}
        value={value.publicationPolicy?.unit ?? 'unset'}
        options={[
          { value: 'unset', label: 'Sem unidade definida' },
          ...Object.entries(publicationUnitLabels).map(([value, label]) => ({ value, label })),
        ]}
        onValueChange={(unit) => {
          const next = { ...value };
          if (unit === 'unset') delete next.publicationPolicy;
          else if (Object.hasOwn(publicationUnitLabels, unit))
            next.publicationPolicy = {
              version: 1,
              unit: unit as LiteraryPublicationUnit,
              ...(unit !== 'book' &&
              value.publicationPolicy?.requirePreviousPublication !== undefined
                ? { requirePreviousPublication: value.publicationPolicy.requirePreviousPublication }
                : {}),
            };
          else return;
          onChange(next);
        }}
      />
      {value.publicationPolicy && value.publicationPolicy.unit !== 'book' && (
        <Dropdown
          mode="select"
          label="Publicação antes de avançar o ciclo"
          disabled={disabled}
          value={
            value.publicationPolicy.requirePreviousPublication === true ? 'required' : 'optional'
          }
          options={[
            { value: 'optional', label: 'Não exigir publicação anterior' },
            { value: 'required', label: 'Exigir publicação da unidade anterior' },
          ]}
          onValueChange={(choice) => {
            if (!value.publicationPolicy || !['required', 'optional'].includes(choice)) return;
            onChange({
              ...value,
              publicationPolicy: {
                ...value.publicationPolicy,
                requirePreviousPublication: choice === 'required',
              },
            });
          }}
        />
      )}
      {value.publicationPolicy?.requirePreviousPublication === true && (
        <p>
          Os ciclos exigirão inspeção da ordem e confirmação da publicação anterior. A primeira
          unidade usa a prova de que não há predecessora; dentro do ato, o ingresso confirmado é
          preservado. Capítulos sem ato contam como unidades individuais.
        </p>
      )}
      {value.publicationPolicy?.unit === 'book' && (
        <p>Livro inteiro não exige publicação predecessora dentro do mesmo livro.</p>
      )}
      <p>
        Define o escopo permitido para novas edições. Publicar continua dependendo da revisão e da
        confirmação do autor. Sem uma unidade definida, você escolhe o escopo de cada edição. Em
        capítulo ou ato, a edição inclui as unidades anteriores na ordem de leitura.
      </p>
    </div>
  );
}
