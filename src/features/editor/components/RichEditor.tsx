import { useState, useRef, useMemo, type KeyboardEvent, type ChangeEvent } from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Quote,
  MessageSquare,
  AtSign,
  BookOpen,
  Eye,
  Edit3,
} from 'lucide-react';
import { Button, Badge } from '@vitru/styleguide';
import {
  findLoreMatches,
  LoreTooltip,
  type LoreCategory,
  type LoreEntity,
  type LoreMatch,
} from '@/features/lore';
import { MentionMenu } from './MentionMenu';
import styles from './RichEditor.module.css';

export interface RichEditorProps {
  content: string;
  onChange: (content: string) => void;
  entities: LoreEntity[];
  onSelectEntity: (entity: LoreEntity) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  placeholder?: string;
}

const CATEGORY_BADGES: Record<
  LoreCategory,
  'neutral' | 'accent' | 'success' | 'danger' | 'highlight'
> = {
  character: 'accent',
  location: 'success',
  concept: 'highlight',
  other: 'neutral',
};

export function RichEditor({
  content,
  onChange,
  entities,
  onSelectEntity,
  isSidebarOpen,
  onToggleSidebar,
  placeholder = 'Comece a escrever seu capítulo aqui...',
}: RichEditorProps) {
  const [viewMode, setViewMode] = useState<'write' | 'preview'>('write');
  const [mentionState, setMentionState] = useState<{
    isOpen: boolean;
    query: string;
    startIndex: number;
    selectedIndex: number;
  }>({
    isOpen: false,
    query: '',
    startIndex: -1,
    selectedIndex: 0,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Mapeia todas as ocorrências de lore no texto atual
  const matches = useMemo(() => {
    return findLoreMatches(content, entities);
  }, [content, entities]);

  // Lista de entidades únicas mencionadas no texto
  const mentionedEntities = useMemo(() => {
    const map = new Map<string, { entity: LoreEntity; count: number }>();
    for (const m of matches) {
      const existing = map.get(m.entityId);
      if (existing) {
        existing.count++;
      } else {
        map.set(m.entityId, { entity: m.entity, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [matches]);

  // Filtra entidades para o menu de menções (@)
  const mentionCandidates = useMemo(() => {
    if (!mentionState.isOpen) return [];
    const q = mentionState.query.toLowerCase();
    return entities.filter((e) => {
      if (!q) return true;
      const nameMatch = e.name.toLowerCase().includes(q);
      const aliasMatch = e.aliases.some((a) => a.toLowerCase().includes(q));
      return nameMatch || aliasMatch;
    });
  }, [entities, mentionState.isOpen, mentionState.query]);

  const insertFormatting = (prefix: string, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);

    const replacement = `${prefix}${selectedText || 'texto'}${suffix}`;
    const newContent = content.substring(0, start) + replacement + content.substring(end);

    onChange(newContent);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + prefix.length + (selectedText ? selectedText.length : 5);
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const insertDialogueDash = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const newContent = content.substring(0, lineStart) + '— ' + content.substring(lineStart);

    onChange(newContent);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + 2;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  const handleSelectMention = (entity: LoreEntity) => {
    const textarea = textareaRef.current;
    if (!textarea || mentionState.startIndex === -1) return;

    const before = content.substring(0, mentionState.startIndex);
    const cursor = textarea.selectionStart;
    const after = content.substring(cursor);

    const insertion = entity.name + ' ';
    const newContent = before + insertion + after;

    onChange(newContent);

    setMentionState({
      isOpen: false,
      query: '',
      startIndex: -1,
      selectedIndex: 0,
    });

    setTimeout(() => {
      textarea.focus();
      const newPos = before.length + insertion.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newText);

    // Detecção de caractere de menção @
    const lastAtIndex = newText.lastIndexOf('@', cursorPos - 1);
    if (lastAtIndex !== -1) {
      const textAfterAt = newText.substring(lastAtIndex + 1, cursorPos);
      // Menção é válida se não houver quebra de linha nem múltiplos espaços
      if (!textAfterAt.includes('\n') && textAfterAt.length <= 30) {
        setMentionState({
          isOpen: true,
          query: textAfterAt,
          startIndex: lastAtIndex,
          selectedIndex: 0,
        });
        return;
      }
    }

    if (mentionState.isOpen) {
      setMentionState({
        isOpen: false,
        query: '',
        startIndex: -1,
        selectedIndex: 0,
      });
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Menu de menção aberto: captura navegação do teclado
    if (mentionState.isOpen && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionState((prev) => ({
          ...prev,
          selectedIndex: (prev.selectedIndex + 1) % mentionCandidates.length,
        }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionState((prev) => ({
          ...prev,
          selectedIndex:
            (prev.selectedIndex - 1 + mentionCandidates.length) % mentionCandidates.length,
        }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const candidate = mentionCandidates[mentionState.selectedIndex];
        if (candidate) {
          handleSelectMention(candidate);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionState({
          isOpen: false,
          query: '',
          startIndex: -1,
          selectedIndex: 0,
        });
        return;
      }
    }

    // Atalhos de formatação de escrita
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      insertFormatting('**', '**');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      insertFormatting('*', '*');
      return;
    }
  };

  // Renderização do texto anotado com LoreTooltips e marcações
  const renderAnnotatedContent = (rawText: string, loreMatches: LoreMatch[]) => {
    const lines = rawText.split('\n');
    let accumulatedOffset = 0;

    return (
      <div className={styles.renderedParagraphs}>
        {lines.map((line, pIdx) => {
          const pStart = accumulatedOffset;
          const pEnd = pStart + line.length;
          accumulatedOffset = pEnd + 1;

          if (!line.trim()) {
            return (
              <div key={pIdx} className={styles.renderedParagraph}>
                <br />
              </div>
            );
          }

          const isH1 = line.startsWith('# ');
          const isH2 = line.startsWith('## ');
          const prefixLen = isH1 ? 2 : isH2 ? 3 : 0;
          const cleanLine = line.substring(prefixLen);

          const pMatches = loreMatches.filter(
            (m) => m.startIndex >= pStart + prefixLen && m.endIndex <= pEnd,
          );

          let contentNodes;

          if (pMatches.length === 0) {
            contentNodes = cleanLine;
          } else {
            let lineCursor = prefixLen;
            const inlineElements = [];

            for (let i = 0; i < pMatches.length; i++) {
              const m = pMatches[i];
              if (!m) continue;

              const matchStartInLine = m.startIndex - pStart;
              const matchEndInLine = m.endIndex - pStart;

              if (matchStartInLine > lineCursor) {
                inlineElements.push(line.substring(lineCursor, matchStartInLine));
              }

              inlineElements.push(
                <LoreTooltip key={`m-${m.entityId}-${m.startIndex}`} entity={m.entity}>
                  <button
                    type="button"
                    className={styles.loreHighlightBtn}
                    onClick={() => {
                      onSelectEntity(m.entity);
                    }}
                    title={`Ver ficha de ${m.entity.name}`}
                  >
                    {m.matchedText}
                  </button>
                </LoreTooltip>,
              );
              lineCursor = matchEndInLine;
            }

            if (lineCursor < line.length) {
              inlineElements.push(line.substring(lineCursor));
            }

            contentNodes = inlineElements;
          }

          return (
            <div key={pIdx} className={styles.renderedParagraph}>
              {isH1 ? (
                <span className={styles.h1}>{contentNodes}</span>
              ) : isH2 ? (
                <span className={styles.h2}>{contentNodes}</span>
              ) : (
                contentNodes
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar} role="toolbar" aria-label="Ferramentas de escrita">
        <div className={styles.toolGroup}>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => insertFormatting('# ')}
            title="Título Principal (# )"
            aria-label="Título Principal"
          >
            <Heading1 className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => insertFormatting('## ')}
            title="Subtítulo (## )"
            aria-label="Subtítulo"
          >
            <Heading2 className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => insertFormatting('**', '**')}
            title="Negrito (**texto** / Ctrl+B)"
            aria-label="Negrito"
          >
            <Bold className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => insertFormatting('*', '*')}
            title="Itálico (*texto* / Ctrl+I)"
            aria-label="Itálico"
          >
            <Italic className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={insertDialogueDash}
            title="Diálogo (— Travessão)"
            aria-label="Travessão de Diálogo"
          >
            <MessageSquare className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => insertFormatting('> ')}
            title="Citação (> )"
            aria-label="Citação"
          >
            <Quote className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => insertFormatting('@')}
            title="Mencionar Lore (@)"
            aria-label="Mencionar Lore"
          >
            <AtSign className="icon icon-sm" aria-hidden="true" />
          </button>
        </div>

        <div className={styles.toolGroup}>
          <button
            type="button"
            className={`${styles.modeBtn} ${viewMode === 'write' ? styles.modeBtnActive : ''}`}
            onClick={() => setViewMode('write')}
          >
            <Edit3 className="icon icon-sm" aria-hidden="true" />
            <span>Escrita</span>
          </button>
          <button
            type="button"
            className={`${styles.modeBtn} ${viewMode === 'preview' ? styles.modeBtnActive : ''}`}
            onClick={() => setViewMode('preview')}
          >
            <Eye className="icon icon-sm" aria-hidden="true" />
            <span>Leitura com Lore</span>
          </button>

          <Button
            variant={isSidebarOpen ? 'primary' : 'secondary'}
            onClick={onToggleSidebar}
            title="Abrir painel lateral de Lore"
          >
            <BookOpen className="icon icon-sm" aria-hidden="true" />
            <span>Compêndio</span>
            {mentionedEntities.length > 0 && (
              <Badge variant="accent">{mentionedEntities.length}</Badge>
            )}
          </Button>
        </div>
      </div>

      {mentionedEntities.length > 0 && (
        <div className={styles.loreSummaryBar} aria-label="Entidades mencionadas neste capítulo">
          <span className={styles.loreSummaryLabel}>Lore no texto:</span>
          <div className={styles.lorePillsList}>
            {mentionedEntities.map(({ entity, count }) => (
              <button
                key={entity.id}
                type="button"
                className={styles.lorePill}
                onClick={() => onSelectEntity(entity)}
                title={`Clique para abrir a ficha de ${entity.name}`}
              >
                <Badge variant={CATEGORY_BADGES[entity.category]}>
                  {entity.name}
                  {count > 1 ? ` (${count})` : ''}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.editorBody}>
        {viewMode === 'write' ? (
          <div className={styles.writeContainer}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={content}
              placeholder={placeholder}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              aria-label="Área de escrita do capítulo"
              spellCheck={true}
            />

            {mentionState.isOpen && (
              <div className={styles.mentionMenuWrapper}>
                <MentionMenu
                  entities={mentionCandidates}
                  query={mentionState.query}
                  selectedIndex={mentionState.selectedIndex}
                  onSelect={handleSelectMention}
                  onHoverIndex={(idx) =>
                    setMentionState((prev) => ({ ...prev, selectedIndex: idx }))
                  }
                />
              </div>
            )}
          </div>
        ) : (
          <div className={styles.previewContainer}>
            {content.trim() ? (
              renderAnnotatedContent(content, matches)
            ) : (
              <p className={styles.emptyPreview}>Nenhum texto escrito ainda.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
