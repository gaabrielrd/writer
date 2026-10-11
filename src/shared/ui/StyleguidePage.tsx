import { useState } from 'react';
import { Sparkles, BookOpen, Feather, MapPin, MoreHorizontal } from 'lucide-react';
import {
  Button,
  Input,
  Textarea,
  Slider,
  Badge,
  Card,
  Dialog,
  Dropdown,
  DropdownItem,
  Tooltip,
  Alert,
  LoadingState,
  EmptyState,
  ErrorState,
  PageHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './index';
import { useTheme, ThemeToggle, ThemeSelect } from '../theme';

export function StyleguidePage() {
  const { theme, resolvedTheme } = useTheme();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [lastAction, setLastAction] = useState('');
  const [sliderValue, setSliderValue] = useState(50);

  return (
    <div className="flex flex-col gap-8 pb-16">
      <PageHeader
        title="Catálogo do Design System & Temas"
        description={`Componentes modulares construídos com Tailwind CSS e Radix UI. Tema ativo: ${resolvedTheme} (configurado: ${theme}).`}
        actions={
          <div className="flex items-center gap-3">
            <ThemeSelect />
            <ThemeToggle showLabel />
          </div>
        }
      />

      {/* Seção de Temas */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">1. Paletas e Temas Ativos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 flex flex-col gap-2">
            <h3 className="font-semibold text-base">Tema Claro</h3>
            <p className="text-xs opacity-75">
              Superfícies de papel claro com acentos em café e contraste de leitura.
            </p>
          </Card>
          <Card className="p-4 flex flex-col gap-2">
            <h3 className="font-semibold text-base">Tema Escuro</h3>
            <p className="text-xs opacity-75">
              Carvão quente, vidro fumê e acentos em caramelo para foco noturno.
            </p>
          </Card>
          <Card className="p-4 flex flex-col gap-2">
            <h3 className="font-semibold text-base">Tema Sépia (Pergaminho)</h3>
            <p className="text-xs opacity-75">
              Tom quente e relaxante inspirado em papel e livros clássicos.
            </p>
          </Card>
        </div>
      </section>

      {/* Seção de Botões */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">2. Botões (Button)</h2>
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">
              <Sparkles className="icon icon-sm" aria-hidden="true" />
              Primary
            </Button>
            <Button variant="secondary">
              <Feather className="icon icon-sm" aria-hidden="true" />
              Secondary
            </Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Card>
      </section>

      {/* Seção de Badges */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">3. Badges</h2>
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="default">Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="accent">Accent (Lore)</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Destructive</Badge>
          </div>
        </Card>
      </section>

      {/* Seção de Formulários */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">4. Formulários & Entradas</h2>
        <Card className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Título do Livro"
            placeholder="Ex: As Crônicas de Aethelgard"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            hint="Nome que aparecerá na capa"
          />
          <Dropdown
            mode="select"
            searchable
            label="Categoria de Lore"
            options={[
              {
                value: 'character',
                label: 'Personagem',
                icon: <Feather className="icon icon-sm" aria-hidden="true" />,
              },
              {
                value: 'location',
                label: 'Local',
                icon: <MapPin className="icon icon-sm" aria-hidden="true" />,
              },
              {
                value: 'concept',
                label: 'Conceito / Magia',
                icon: <Sparkles className="icon icon-sm" aria-hidden="true" />,
              },
            ]}
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Resumo / Sinopse"
              placeholder="Descreva os acontecimentos principais..."
              rows={3}
            />
          </div>
        </Card>
      </section>

      {/* Seção de Alertas e Diálogos */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">5. Alertas & Diálogos</h2>
        <div className="flex flex-col gap-3">
          <Alert variant="info" title="Informação">
            O assistente de IA Gemini 3.7 Flash consome 1 crédito por sugestão aceita.
          </Alert>
          <Alert variant="success" title="Salvo">
            Todas as alterações do capítulo foram salvas na nuvem.
          </Alert>
          <Alert variant="warning" title="Atenção">
            Você está utilizando 90% dos seus créditos mensais.
          </Alert>
          <Alert variant="destructive" title="Erro">
            Não foi possível estabelecer conexão com o servidor.
          </Alert>
        </div>

        <div>
          <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
            Abrir Modal de Demonstração
          </Button>

          <Dialog
            open={isDialogOpen}
            title="Modal do Design System"
            description="Exemplo de diálogo totalmente integrado aos temas."
            onClose={() => setIsDialogOpen(false)}
            footer={
              <>
                <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>
                  Fechar
                </Button>
                <Button variant="primary" onClick={() => setIsDialogOpen(false)}>
                  Confirmar
                </Button>
              </>
            }
          >
            <p className="text-sm py-2">
              Este diálogo se adapta automaticamente a qualquer tema (Claro, Escuro ou Sépia).
            </p>
            <Slider
              label="Intensidade de exemplo"
              value={sliderValue}
              onValueChange={setSliderValue}
              low="Discreta"
              high="Marcante"
              description="Controle acessível de 0 a 100, operável por teclado."
            />
            <section className="flex flex-col gap-4">
              <h2 className="text-xl font-bold">Menus e dicas</h2>
              <div className="flex flex-wrap gap-3">
                <Dropdown
                  label="Menu de exemplo"
                  trigger={<Button variant="secondary">Abrir menu</Button>}
                >
                  <DropdownItem>Item do menu</DropdownItem>
                  <DropdownItem disabled>Item indisponível</DropdownItem>
                </Dropdown>
                <Dropdown
                  mode="action"
                  label="Ações com busca"
                  searchable
                  icon={<Feather className="icon icon-sm" aria-hidden="true" />}
                  variant="outline"
                  options={[
                    {
                      value: 'export',
                      label: 'Exportar exemplo',
                      icon: <BookOpen className="icon icon-sm" aria-hidden="true" />,
                      onSelect: () => setLastAction('Exportar exemplo'),
                    },
                    {
                      value: 'edit',
                      label: 'Editar exemplo',
                      onSelect: () => setLastAction('Editar exemplo'),
                    },
                  ]}
                />
                <Dropdown
                  mode="action"
                  label="Ações somente com ícone"
                  iconOnly
                  icon={<MoreHorizontal className="icon" aria-hidden="true" />}
                  variant="ghost"
                  options={[
                    {
                      value: 'edit',
                      label: 'Editar exemplo',
                      onSelect: () => setLastAction('Editar exemplo'),
                    },
                  ]}
                />
                <Tooltip content="Detalhes disponíveis por foco, toque ou hover">
                  <Button variant="secondary">Mostrar dica</Button>
                </Tooltip>
              </div>
              {lastAction && <p role="status">Ação executada: {lastAction}</p>}
            </section>
          </Dialog>
        </div>
      </section>

      {/* Seção de Estados */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">6. Estados de Tela</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4">
            <LoadingState label="Carregando compêndio..." />
          </Card>
          <Card className="p-4">
            <EmptyState
              title="Nenhum livro criado"
              description="Crie seu primeiro livro para começar a escrever."
              action={
                <Button size="sm">
                  <BookOpen className="icon icon-sm" aria-hidden="true" />
                  Criar Livro
                </Button>
              }
            />
          </Card>
          <Card className="p-4">
            <ErrorState
              title="Falha ao carregar"
              message="Verifique sua conexão."
              onRetry={() => {}}
            />
          </Card>
        </div>
      </section>

      {/* Seção de Tabelas */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold">7. Tabelas</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Título</TableHead>
              <TableHead>Capítulos</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">O Nome do Vento</TableCell>
              <TableCell>92 capítulos</TableCell>
              <TableCell>
                <Badge variant="success">Publicado</Badge>
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">O Temor do Sábio</TableCell>
              <TableCell>140 capítulos</TableCell>
              <TableCell>
                <Badge variant="accent">Rascunho</Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
