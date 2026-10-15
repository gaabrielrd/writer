import { useState, useRef, useMemo, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { closeHistory } from '@tiptap/pm/history';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Quote,
  MessageSquare,
  AtSign,
  BookOpen,
  Undo2,
  Redo2,
} from 'lucide-react';
import { Button, Badge } from '@/shared/ui';
import { findLoreMatches, type LoreCategory, type LoreEntity } from '@/features/lore';
import {
  useAIAutocomplete,
  GhostSuggestion,
  AIActionMenu,
  AIChatLauncher,
  OutOfCreditsDialog,
  useAISettings,
  useAIConfig,
  type WritingPersonaContext,
  type ChatEditorBridge,
  type AIActionType,
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
import { useSelectionAnchor } from '../hooks/useSelectionAnchor';
import { useChapterMinimap } from '../hooks/useChapterMinimap';
import { ChapterMinimap } from './ChapterMinimap';
import { useChatEditorBridge } from '../hooks/useChatEditorBridge';
import styles from './RichEditor.module.css';

export interface RichEditorProps {
  ariaLabel?: string;
  workspaceExpanded?: boolean;
  chatOpen?: boolean;
  onOpenChat?: (action?: AIActionType) => void;
  onChatBridge?: (bridge: ChatEditorBridge | null) => void;
  chapterTitle?: string;
  bookTitle?: string;
  writingPersona?: WritingPersonaContext;
  aiUnavailableReason?: string | null;
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
  externalBusy?: boolean;
  externalContentVersion?: number;
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
  ariaLabel = 'Área de escrita do capítulo',
  workspaceExpanded = false,
  chatOpen = false,
  onOpenChat,
  onChatBridge,
  chapterTitle = '',
  bookTitle = '',
  documentId,
  writingPersona,
  aiUnavailableReason,
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
  externalBusy = false,
  externalContentVersion = 0,
}: RichEditorProps) {
  // Initial parsing is intentionally lazy: transaction-driven renders must not
  // sanitize the whole chapter again. Real external replacements use the effect below.
  const [initialHtml] = useState(() => renderRichText(content));
  const [isOutOfCreditsOpen, setIsOutOfCreditsOpen] = useState(false);
  const openAISettings = useAISettings();
  const config = useAIConfig();
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [hover, setHover] = useState<{ entity: LoreEntity; left: number; top: number } | null>(
    null,
  );
  const menuId = useId();
  const lastContent = useRef(content);
  const typedInput = useRef(false);
  const typingSequence = useRef(0);
  const [typingRevision, setTypingRevision] = useState<number | null>(null);
  const keyHandler = useRef<(event: KeyboardEvent) => boolean>(() => false);
  const expandedRef = useRef(workspaceExpanded);
  const discardRef = useRef<() => void>(() => undefined);
  const acceptingRef = useRef(false);
  const externalBusyRef = useRef(externalBusy);
  const appliedContentVersion = useRef(externalContentVersion);
  const blocked = accepting || externalBusy;
  useLayoutEffect(() => {
    externalBusyRef.current = externalBusy;
  }, [externalBusy]);
  const aiTarget = useRef<SelectionTarget | null>(null);
  const previousSidebar = useRef(isSidebarOpen);
  const scrollArea = useRef<HTMLDivElement>(null);
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
          'aria-label': ariaLabel,
          spellcheck: 'true',
          'data-placeholder': placeholder,
        },
        transformPastedHTML: sanitizeRichText,
        handleKeyDown: (_view, event) => keyHandler.current(event),
        handleTextInput: () => {
          typedInput.current = true;
          return false;
        },
        handleDOMEvents: {
          keydown: (_view, event) => {
            if (!expandedRef.current || event.key !== 'Escape' || event.isComposing) return false;
            // ProseMirror captures idle Escape itself. Handle the DOM event so an
            // idle key can reach the workspace; active editor overlays still consume it.
            if (keyHandler.current(event)) event.preventDefault();
            return true;
          },
          beforeinput: (_view, event) => {
            typedInput.current =
              /^(insertText|insertCompositionText|insertParagraph|insertLineBreak|deleteContentBackward|deleteContentForward)$/.test(
                event.inputType,
              );
            return false;
          },
        },
      },
      onUpdate: ({ editor: activeEditor }) => {
        if (typedInput.current) setTypingRevision(++typingSequence.current);
        typedInput.current = false;
        lastContent.current = activeEditor.getHTML();
        onChange(lastContent.current);
        setMentionDismissed(false);
        setSelectedIndex(0);
        setHover(null);
        discardRef.current();
      },
      onSelectionUpdate: ({ transaction }) => {
        if (transaction.docChanged) return;
        typedInput.current = false;
        setTypingRevision(null);
        setMentionDismissed(false);
        setSelectedIndex(0);
        discardRef.current();
      },
    },
    [documentId],
  );
  const text = editor?.getText({ blockSeparator: '\n' }) ?? '';
  const minimap = useChapterMinimap(editor, entities, scrollArea);
  useChatEditorBridge(editor, scrollArea, {
    title: chapterTitle,
    bookTitle,
    persona: writingPersona ?? { instruction: '', version: '' },
    entities,
    setBusy: (busy) => {
      acceptingRef.current = busy;
      setAccepting(busy);
      onBusyChange?.(busy);
    },
    onReady: onChatBridge,
  });
  const cursorPosition =
    editor?.state.doc.textBetween(0, editor.state.selection.from, '\n', '\n').length ?? 0;
  const isUsingBYOK = config.provider !== 'firebase_ai';
  const { suggestion, acceptSuggestion, discardSuggestion } = useAIAutocomplete({
    writingPersona,
    typingRevision,
    content: text,
    cursorPosition,
    loreEntities: entities,
    userId,
    userCredits,
    onCreditDeducted,
    onShowOutOfCredits: () => setIsOutOfCreditsOpen(true),
    enabled: !aiUnavailableReason && !blocked && Boolean(editor?.state.selection.empty),
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
    if (!editor) return;
    const restored = appliedContentVersion.current !== externalContentVersion;
    appliedContentVersion.current = externalContentVersion;
    if (content === lastContent.current) return;
    lastContent.current = content;
    if (restored) editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.setContent(renderRichText(content), { emitUpdate: false });
    if (restored) editor.view.dispatch(closeHistory(editor.state.tr));
  }, [content, editor, externalContentVersion]);
  useLayoutEffect(() => {
    editor?.setEditable(!blocked, false);
    editor?.view.dom.setAttribute('aria-readonly', String(blocked));
  }, [editor, blocked]);
  useEffect(() => {
    // This effect runs after the panel is removed. Restore focus once now:
    // a later focus frame could overwrite the user's next native caret move.
    if (previousSidebar.current && !isSidebarOpen && editor && !editor.isDestroyed)
      editor.view.focus();
    previousSidebar.current = isSidebarOpen;
  }, [isSidebarOpen, editor]);

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
  const mention = editor && !mentionDismissed ? getMentionRange(editor.state) : null;
  const selectionAnchor = useSelectionAnchor(
    editor,
    !blocked && !isAssistantOpen && !chatOpen && !mention,
  );
  const candidates = mention ? mentionCandidates(entities, mention.query) : [];
  const activeGhost = !mention && !blocked ? suggestion : null;
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
    editor?.setEditable(!busy && !externalBusyRef.current, false);
    onBusyChange?.(busy);
  };
  const handleAcceptGhost = async () => {
    if (!editor || acceptingRef.current || externalBusyRef.current) return;
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
    expandedRef.current = workspaceExpanded;
    keyHandler.current = (event) => {
      if (event.isComposing || editor?.view.composing) return false;
      if (acceptingRef.current || externalBusyRef.current) return true;
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
        setTypingRevision(null);
        discardSuggestion();
        setHover(null);
        return Boolean(suggestion || hover);
      }
      if (/^(ArrowLeft|ArrowRight|ArrowUp|ArrowDown|Home|End|PageUp|PageDown)$/.test(event.key)) {
        // Native selection notifications can coalesce a quick move out and back.
        // Cancel the intent too, so a pending typing effect cannot rearm the timer.
        setTypingRevision(null);
        discardSuggestion();
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
    if (editor && !acceptingRef.current && !externalBusyRef.current) command(editor);
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
    <div className={styles.container} data-workspace-expanded={workspaceExpanded}>
      <div className={styles.toolbar} role="toolbar" aria-label="Ferramentas de escrita">
        <div className={styles.toolGroup} role="group" aria-label="Formatação">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked}
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
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked}
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
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked}
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
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked}
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
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked}
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
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked}
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
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked}
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
          </Button>
        </div>
        <div className={styles.historyTools} role="group" aria-label="Histórico de edição">
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked || !editor?.can().undo()}
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
          </Button>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={styles.toolBtn}
            disabled={blocked || !editor?.can().redo()}
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
          </Button>
        </div>
        <div
          className={`${styles.toolGroup} ${styles.panelTools}`}
          role="group"
          aria-label="Painéis do editor"
        >
          {onOpenChat ? (
            <AIChatLauncher
              disabled={blocked || Boolean(aiUnavailableReason)}
              open={chatOpen}
              onOpen={onOpenChat}
              anchor={selectionAnchor}
            />
          ) : (
            <AIActionMenu
              writingPersona={writingPersona}
              aiUnavailableReason={
                externalBusy ? 'Aguarde a confirmação do histórico.' : aiUnavailableReason
              }
              selectionAnchor={selectionAnchor}
              onOpenChange={setIsAssistantOpen}
              onReturnFocus={() => {
                if (editor && !editor.isDestroyed) editor.view.focus();
              }}
              onGetSelectedText={captureSelection}
              onGetContextText={() => text}
              onCanApplyResult={() =>
                !acceptingRef.current && !externalBusyRef.current && canApplyResult()
              }
              onApplyingChange={setApplying}
              loreEntities={entities}
              userId={userId}
              userCredits={userCredits}
              onCreditDeducted={onCreditDeducted}
              onShowOutOfCredits={() => setIsOutOfCreditsOpen(true)}
              onInsertText={(value) => applyGeneratedText(value, false)}
              onReplaceSelection={(value) => applyGeneratedText(value, true)}
            />
          )}
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
      <div className={styles.bodyLayout}>
        <ChapterMinimap
          destinations={minimap.destinations}
          viewport={minimap.viewport}
          onNavigate={minimap.navigate}
        />
        <div className={styles.editorBody} data-editor-scroll-area ref={scrollArea}>
          <div className={styles.writeContainer}>
            <EditorContent
              editor={editor}
              onKeyDownCapture={(event) => {
                if (
                  event.altKey &&
                  event.key === 'Enter' &&
                  selectionAnchor &&
                  !event.nativeEvent.isComposing &&
                  !editor?.view.composing
                ) {
                  document
                    .querySelector<HTMLButtonElement>('[data-editor-selection-actions] button')
                    ?.focus();
                  event.preventDefault();
                  event.stopPropagation();
                }
              }}
              aria-busy={blocked}
            />
            {suggestion && (
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
