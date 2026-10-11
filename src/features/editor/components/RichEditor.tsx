import { useState, useRef, useMemo, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
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
  Undo2,
  Redo2,
} from 'lucide-react';
import { Button, Badge } from '@/shared/ui';
import { findLoreMatches, type LoreCategory, type LoreEntity } from '@/features/lore';
import {
  useAIAutocomplete,
  GhostSuggestion,
  AIActionMenu,
  OutOfCreditsDialog,
  useAISettings,
  useAIConfig,
} from '@/features/ai-assistant';
import { renderRichText, sanitizeRichText } from '@/shared/lib/sanitizeRichText';
import {
  createLoreExtension,
  GhostTextExtension,
  ghostSuggestionKey,
  getMentionRange,
  loreDecorationKey,
  mentionCandidates,
  plainTextContent,
} from '../model/richDocument';
import { MentionMenu } from './MentionMenu';
import styles from './RichEditor.module.css';

export interface RichEditorProps {
  documentId?: string;
  content: string;
  onChange: (content: string) => void;
  entities: LoreEntity[];
  onSelectEntity: (entity: LoreEntity) => void;
  onCreateEntity?: (name: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  placeholder?: string;
  userId?: string | null;
  userCredits?: number;
  onCreditDeducted?: (newCredits: number) => void;
  onBusyChange?: (busy: boolean) => void;
}

const CATEGORY_BADGES: Record<LoreCategory, 'default' | 'accent' | 'success' | 'secondary'> = {
  character: 'accent',
  location: 'success',
  concept: 'default',
  other: 'secondary',
};
const CATEGORY_LABELS: Record<LoreCategory, string> = {
  character: 'Personagem',
  location: 'Local',
  concept: 'Conceito',
  other: 'Outro',
};
interface SelectionTarget {
  doc: ProseMirrorNode;
  from: number;
  to: number;
}

export function RichEditor({
  documentId,
  content,
  onChange,
  entities,
  onSelectEntity,
  onCreateEntity,
  isSidebarOpen,
  onToggleSidebar,
  placeholder = 'Comece a escrever seu capítulo aqui...',
  userId,
  userCredits = 0,
  onCreditDeducted,
  onBusyChange,
}: RichEditorProps) {
  // Initial parsing is intentionally lazy: transaction-driven renders must not
  // sanitize the whole chapter again. Real external replacements use the effect below.
  const [initialHtml] = useState(() => renderRichText(content));
  const [viewMode, setViewMode] = useState<'write' | 'preview'>('write');
  const [isOutOfCreditsOpen, setIsOutOfCreditsOpen] = useState(false);
  const openAISettings = useAISettings();
  const config = useAIConfig();
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [hover, setHover] = useState<{ entity: LoreEntity; left: number; top: number } | null>(
    null,
  );
  const menuId = useId();
  const lastContent = useRef(content);
  const keyHandler = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const discardRef = useRef<() => void>(() => undefined);
  const acceptingRef = useRef(false);
  const aiTarget = useRef<SelectionTarget | null>(null);
  const previousSidebar = useRef(isSidebarOpen);
  const [menuPosition, setMenuPosition] = useState({ top: 40, left: 0 });
  const [loreOptions] = useState(() => ({
    getEntities: () => entities,
    onSelect: onSelectEntity,
    onHover: (entity: LoreEntity | null, element?: HTMLElement) => {
      if (!entity || !element) {
        setHover(null);
        return;
      }
      const bounds = element.getBoundingClientRect();
      setHover({
        entity,
        left: Math.max(8, Math.min(bounds.left, window.innerWidth - 296)),
        top:
          bounds.bottom > window.innerHeight - 180
            ? Math.max(8, bounds.top - 150)
            : bounds.bottom + 8,
      });
    },
  }));
  const [loreExtension] = useState(() => createLoreExtension(loreOptions));

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          link: { openOnClick: false, autolink: false },
          trailingNode: false,
        }),
        loreExtension.extension,
        GhostTextExtension,
      ],
      content: initialHtml,
      shouldRerenderOnTransaction: true,
      editorProps: {
        attributes: {
          class: styles.richText ?? '',
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': 'Área de escrita do capítulo',
          spellcheck: 'true',
          'data-placeholder': placeholder,
        },
        transformPastedHTML: sanitizeRichText,
        handleKeyDown: (_view, event) => keyHandler.current(event),
      },
      onUpdate: ({ editor: activeEditor }) => {
        lastContent.current = activeEditor.getHTML();
        onChange(lastContent.current);
        setMentionDismissed(false);
        setSelectedIndex(0);
        setHover(null);
        discardRef.current();
      },
      onSelectionUpdate: () => {
        setMentionDismissed(false);
        setSelectedIndex(0);
        discardRef.current();
      },
    },
    [documentId],
  );
  const text = editor?.getText({ blockSeparator: '\n' }) ?? '';
  const cursorPosition =
    editor?.state.doc.textBetween(0, editor.state.selection.from, '\n', '\n').length ?? 0;
  const isUsingBYOK = config.provider !== 'firebase_ai';
  const { suggestion, acceptSuggestion, discardSuggestion } = useAIAutocomplete({
    content: text,
    cursorPosition,
    loreEntities: entities,
    userId,
    userCredits,
    onCreditDeducted,
    onShowOutOfCredits: () => setIsOutOfCreditsOpen(true),
    enabled: viewMode === 'write' && !accepting && Boolean(editor?.state.selection.empty),
  });

  useEffect(() => {
    discardRef.current = discardSuggestion;
  }, [discardSuggestion]);
  useEffect(() => {
    loreExtension.update({ onSelect: onSelectEntity });
  }, [onSelectEntity, loreExtension]);
  useEffect(() => {
    loreExtension.update({ getEntities: () => entities });
    if (editor && !editor.isDestroyed)
      editor.view.dispatch(editor.state.tr.setMeta(loreDecorationKey, true));
  }, [entities, editor, loreExtension]);
  useEffect(() => {
    // A parent echo must never recreate the document: that loses cursor, composition and undo.
    if (!editor || content === lastContent.current) return;
    lastContent.current = content;
    editor.commands.setContent(renderRichText(content), { emitUpdate: false });
  }, [content, editor]);
  useEffect(() => {
    editor?.setEditable(viewMode === 'write' && !accepting, false);
    editor?.view.dom.setAttribute('aria-readonly', String(viewMode !== 'write' || accepting));
  }, [editor, viewMode, accepting]);
  useEffect(() => {
    if (previousSidebar.current && !isSidebarOpen && viewMode === 'write')
      editor?.commands.focus(undefined, { scrollIntoView: false });
    previousSidebar.current = isSidebarOpen;
  }, [isSidebarOpen, editor, viewMode]);

  const matches = useMemo(() => findLoreMatches(text, entities), [text, entities]);
  const mentionedEntities = useMemo(() => {
    const map = new Map<string, { entity: LoreEntity; count: number }>();
    for (const match of matches) {
      const existing = map.get(match.entityId);
      if (existing) existing.count += 1;
      else map.set(match.entityId, { entity: match.entity, count: 1 });
    }
    return Array.from(map.values());
  }, [matches]);
  const mention =
    editor && !mentionDismissed && viewMode === 'write' ? getMentionRange(editor.state) : null;
  const candidates = mention ? mentionCandidates(entities, mention.query) : [];
  const activeGhost = viewMode === 'write' && !mention && !accepting ? suggestion : null;
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const position = editor.state.selection.from;
    const before = editor.state.doc.textBetween(Math.max(0, position - 1), position);
    editor.view.dispatch(
      editor.state.tr.setMeta(
        ghostSuggestionKey,
        activeGhost
          ? { position, text: `${before && !/\s$/.test(before) ? ' ' : ''}${activeGhost}` }
          : null,
      ),
    );
  }, [editor, activeGhost]);
  const canCreate = Boolean(mention?.query.trim() && candidates.length === 0 && onCreateEntity);
  const optionCount = candidates.length + (canCreate ? 1 : 0);
  const activeIndex = optionCount ? Math.min(selectedIndex, optionCount - 1) : 0;

  const selectMention = (entity: LoreEntity) => {
    if (!editor || !mention) return;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: mention.from, to: mention.to },
        { type: 'text', text: `${entity.name} ` },
      )
      .run();
    setMentionDismissed(true);
  };
  const createMention = () => {
    if (!mention || !onCreateEntity) return;
    setMentionDismissed(true);
    onCreateEntity(mention.query.trim());
  };
  const setApplying = (busy: boolean) => {
    acceptingRef.current = busy;
    setAccepting(busy);
    editor?.setEditable(viewMode === 'write' && !busy, false);
    onBusyChange?.(busy);
  };
  const handleAcceptGhost = async () => {
    if (!editor || acceptingRef.current) return;
    const target = {
      doc: editor.state.doc,
      from: editor.state.selection.from,
      to: editor.state.selection.to,
    };
    setApplying(true);
    try {
      const accepted = await acceptSuggestion(
        () => !editor.isDestroyed && editor.state.doc.eq(target.doc),
      );
      if (!accepted || editor.isDestroyed || !editor.state.doc.eq(target.doc)) return;
      const before = editor.state.doc.textBetween(Math.max(0, target.from - 1), target.from);
      editor
        .chain()
        .focus()
        .insertContentAt(
          { from: target.from, to: target.to },
          { type: 'text', text: `${before && !/\s$/.test(before) ? ' ' : ''}${accepted}` },
        )
        .run();
    } finally {
      if (!editor.isDestroyed) setApplying(false);
    }
  };

  useEffect(() => {
    keyHandler.current = (event) => {
      if (event.isComposing || editor?.view.composing) return false;
      if (acceptingRef.current) return true;
      if (mention) {
        if (event.key === 'Escape') {
          setMentionDismissed(true);
          event.preventDefault();
          return true;
        }
        if (optionCount > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          setSelectedIndex(
            (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + optionCount) % optionCount,
          );
          event.preventDefault();
          return true;
        }
        if (optionCount > 0 && (event.key === 'Enter' || event.key === 'Tab')) {
          const candidate = candidates[activeIndex];
          if (candidate) selectMention(candidate);
          else createMention();
          event.preventDefault();
          return true;
        }
      }
      if (event.key === 'Tab' && suggestion) {
        event.preventDefault();
        void handleAcceptGhost();
        return true;
      }
      if (event.key === 'Escape') {
        discardSuggestion();
        setHover(null);
        return true;
      }
      return false; // StarterKit owns formatting, history and platform keyboard conventions.
    };
  });

  const captureSelection = () => {
    if (!editor) return '';
    const { from, to } = editor.state.selection;
    aiTarget.current = { doc: editor.state.doc, from, to };
    return editor.state.doc.textBetween(from, to, '\n');
  };
  const canApplyResult = () =>
    Boolean(
      editor &&
      !editor.isDestroyed &&
      aiTarget.current &&
      editor.state.doc.eq(aiTarget.current.doc),
    );
  const applyGeneratedText = (value: string, replace: boolean) => {
    const target = aiTarget.current;
    if (!editor || !target || !canApplyResult()) return false;
    editor
      .chain()
      .focus()
      .insertContentAt(
        replace ? { from: target.from, to: target.to } : target.to,
        plainTextContent(value),
      )
      .run();
    aiTarget.current = null;
    return true;
  };
  const run = (command: (activeEditor: Editor) => void) => {
    if (editor && !accepting) command(editor);
  };
  useEffect(() => {
    if (!editor) return;
    const positionMenu = () => {
      const range = getMentionRange(editor.state);
      if (!range) return;
      try {
        const caret = editor.view.coordsAtPos(range.to);
        setMenuPosition({
          top:
            caret.bottom > window.innerHeight - 296
              ? Math.max(8, caret.top - 286)
              : caret.bottom + 6,
          left: Math.max(8, Math.min(caret.left, window.innerWidth - 328)),
        });
      } catch {
        /* Geometry is unavailable in non-layout test environments. */
      }
    };
    editor.on('transaction', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    window.addEventListener('resize', positionMenu);
    return () => {
      editor.off('transaction', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
      window.removeEventListener('resize', positionMenu);
    };
  }, [editor]);
  useEffect(() => {
    if (!editor) return;
    const element = editor.view.dom;
    element.setAttribute('aria-expanded', String(Boolean(mention)));
    element.setAttribute('aria-autocomplete', 'list');
    if (mention) {
      element.setAttribute('aria-controls', menuId);
      if (optionCount > 0)
        element.setAttribute('aria-activedescendant', `${menuId}-option-${activeIndex}`);
      else element.removeAttribute('aria-activedescendant');
    } else {
      element.removeAttribute('aria-controls');
      element.removeAttribute('aria-activedescendant');
    }
  }, [editor, mention, menuId, optionCount, activeIndex]);

  return (
    <div className={styles.container}>
      <div className={styles.toolbar} role="toolbar" aria-label="Ferramentas de escrita">
        <div className={styles.toolGroup}>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                active.chain().focus().toggleHeading({ level: 1 }).run();
              })
            }
            title="Título Principal"
            aria-label="Título Principal"
            aria-pressed={editor?.isActive('heading', { level: 1 }) ?? false}
          >
            <Heading1 className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                active.chain().focus().toggleHeading({ level: 2 }).run();
              })
            }
            title="Subtítulo"
            aria-label="Subtítulo"
            aria-pressed={editor?.isActive('heading', { level: 2 }) ?? false}
          >
            <Heading2 className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                active.chain().focus().toggleBold().run();
              })
            }
            title="Negrito (Ctrl+B / ⌘B)"
            aria-label="Negrito"
            aria-pressed={editor?.isActive('bold') ?? false}
          >
            <Bold className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                active.chain().focus().toggleItalic().run();
              })
            }
            title="Itálico (Ctrl+I / ⌘I)"
            aria-label="Itálico"
            aria-pressed={editor?.isActive('italic') ?? false}
          >
            <Italic className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                const { $from } = active.state.selection;
                active
                  .chain()
                  .focus()
                  .insertContentAt($from.start(), { type: 'text', text: '— ' })
                  .run();
              })
            }
            title="Diálogo (— Travessão)"
            aria-label="Travessão de Diálogo"
          >
            <MessageSquare className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                active.chain().focus().toggleBlockquote().run();
              })
            }
            title="Citação"
            aria-label="Citação"
            aria-pressed={editor?.isActive('blockquote') ?? false}
          >
            <Quote className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                active.chain().focus().insertContent({ type: 'text', text: '@' }).run();
              })
            }
            title="Mencionar Lore (@)"
            aria-label="Mencionar Lore"
          >
            <AtSign className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview' || !editor?.can().undo()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                active.chain().focus().undo().run();
              })
            }
            title="Desfazer (Ctrl+Z / ⌘Z)"
            aria-label="Desfazer"
          >
            <Undo2 className="icon icon-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.toolBtn}
            disabled={accepting || viewMode === 'preview' || !editor?.can().redo()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              run((active) => {
                active.chain().focus().redo().run();
              })
            }
            title="Refazer (Ctrl+Shift+Z / ⌘Shift+Z)"
            aria-label="Refazer"
          >
            <Redo2 className="icon icon-sm" aria-hidden="true" />
          </button>
        </div>
        <div className={styles.toolGroup}>
          <AIActionMenu
            onGetSelectedText={captureSelection}
            onGetContextText={() => text}
            onCanApplyResult={() => !acceptingRef.current && canApplyResult()}
            onApplyingChange={setApplying}
            loreEntities={entities}
            userId={userId}
            userCredits={userCredits}
            onCreditDeducted={onCreditDeducted}
            onShowOutOfCredits={() => setIsOutOfCreditsOpen(true)}
            onInsertText={(value) => applyGeneratedText(value, false)}
            onReplaceSelection={(value) => applyGeneratedText(value, true)}
            onOpenBYOKSettings={openAISettings}
          />
          <div className={styles.modeSwitch} role="group" aria-label="Modo do editor">
            <Button
              variant="secondary"
              disabled={accepting}
              className={`${styles.modeBtn} ${viewMode === 'write' ? styles.modeBtnActive : ''}`}
              aria-pressed={viewMode === 'write'}
              onClick={() => setViewMode('write')}
            >
              <Edit3 className="icon icon-sm" aria-hidden="true" />
              <span>Edição</span>
            </Button>
            <Button
              variant="secondary"
              disabled={accepting}
              className={`${styles.modeBtn} ${viewMode === 'preview' ? styles.modeBtnActive : ''}`}
              aria-pressed={viewMode === 'preview'}
              onClick={() => {
                discardSuggestion();
                setViewMode('preview');
              }}
            >
              <Eye className="icon icon-sm" aria-hidden="true" />
              <span>Preview</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            aria-pressed={isSidebarOpen}
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
        <div className={styles.writeContainer}>
          {viewMode === 'preview' && editor?.isEmpty && (
            <p className={styles.emptyPreview}>Nenhum texto escrito ainda.</p>
          )}
          <EditorContent
            editor={editor}
            className={viewMode === 'preview' ? styles.previewContainer : undefined}
            aria-busy={accepting}
          />
          {viewMode === 'write' && suggestion && (
            <GhostSuggestion
              compact
              suggestion={suggestion}
              onAccept={() => void handleAcceptGhost()}
              onDiscard={discardSuggestion}
              isUsingBYOK={isUsingBYOK}
            />
          )}
          {mention &&
            createPortal(
              <div className={styles.mentionMenuWrapper} style={menuPosition}>
                <MentionMenu
                  id={menuId}
                  entities={candidates}
                  query={mention.query}
                  selectedIndex={activeIndex}
                  onSelect={selectMention}
                  onHoverIndex={setSelectedIndex}
                  onCreate={canCreate ? createMention : undefined}
                />
              </div>,
              document.body,
            )}
        </div>
      </div>
      {hover &&
        createPortal(
          <div
            className={styles.inlineTooltip}
            role="tooltip"
            style={{ left: hover.left, top: hover.top }}
          >
            <strong>{hover.entity.name}</strong>
            <Badge variant={CATEGORY_BADGES[hover.entity.category]}>
              {CATEGORY_LABELS[hover.entity.category]}
            </Badge>
            <p>{hover.entity.summary}</p>
            {hover.entity.aliases.length > 0 && (
              <small>Apelidos: {hover.entity.aliases.join(', ')}</small>
            )}
          </div>,
          document.body,
        )}
      <OutOfCreditsDialog
        open={isOutOfCreditsOpen}
        onClose={() => setIsOutOfCreditsOpen(false)}
        onOpenBYOKSettings={() => {
          setIsOutOfCreditsOpen(false);
          openAISettings();
        }}
      />
    </div>
  );
}
