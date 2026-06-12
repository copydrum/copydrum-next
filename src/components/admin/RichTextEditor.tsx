'use client';

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  /** 이미지 파일 업로드 → 업로드된 URL 반환 */
  onImageUpload?: (file: File) => Promise<string>;
  placeholder?: string;
  minHeight?: number;
}

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  icon: string;
}

function ToolbarButton({ onClick, active, disabled, title, icon }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-base transition-colors ${
        active
          ? 'bg-orange-100 text-orange-700'
          : 'text-gray-600 hover:bg-gray-100 disabled:opacity-40'
      }`}
    >
      <i className={icon} />
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px self-center bg-gray-200" />;
}

function Toolbar({
  editor,
  onImageUpload,
}: {
  editor: Editor;
  onImageUpload?: (file: File) => Promise<string>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imgBusy, setImgBusy] = useState(false);

  const addLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('링크 URL을 입력하세요 (비우면 링크 제거)', prev || 'https://');
    if (url === null) return;
    if (url.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const addYoutube = () => {
    const url = window.prompt('YouTube 영상 URL을 입력하세요');
    if (!url || !url.trim()) return;
    editor.commands.setYoutubeVideo({ src: url.trim(), width: 640, height: 360 });
  };

  const pickImage = () => fileInputRef.current?.click();

  const handleImageFile = async (file: File | undefined) => {
    if (!file) return;
    if (!onImageUpload) return;
    setImgBusy(true);
    try {
      const url = await onImageUpload(file);
      editor.chain().focus().setImage({ src: url, alt: '' }).run();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '이미지 업로드 실패';
      alert(msg);
    } finally {
      setImgBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-gray-300 bg-gray-50 px-2 py-1.5">
      <ToolbarButton
        title="굵게"
        icon="ri-bold"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        title="기울임"
        icon="ri-italic"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        title="취소선"
        icon="ri-strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <Divider />
      <ToolbarButton
        title="제목(큰)"
        icon="ri-h-2"
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        title="제목(작은)"
        icon="ri-h-3"
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <Divider />
      <ToolbarButton
        title="글머리 목록"
        icon="ri-list-unordered"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        title="번호 목록"
        icon="ri-list-ordered"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        title="인용구"
        icon="ri-double-quotes-l"
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <Divider />
      <ToolbarButton
        title="링크"
        icon="ri-link"
        active={editor.isActive('link')}
        onClick={addLink}
      />
      {onImageUpload && (
        <ToolbarButton
          title="이미지 삽입"
          icon={imgBusy ? 'ri-loader-4-line animate-spin' : 'ri-image-line'}
          disabled={imgBusy}
          onClick={pickImage}
        />
      )}
      <ToolbarButton title="YouTube 영상 삽입" icon="ri-youtube-line" onClick={addYoutube} />
      <Divider />
      <ToolbarButton
        title="서식 지우기"
        icon="ri-format-clear"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleImageFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  onImageUpload,
  placeholder,
  minHeight = 200,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false }),
      Youtube.configure({ controls: true, nocookie: true, width: 640, height: 360 }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm sm:prose-base max-w-none focus:outline-none px-3 py-3 [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_iframe]:w-full [&_iframe]:aspect-video [&_iframe]:rounded-lg',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      // 빈 에디터는 빈 문자열로 저장 (Tiptap 기본값 <p></p> 방지)
      onChange(html === '<p></p>' ? '' : html);
    },
  });

  // 외부에서 value 가 바뀌면(예: 폼 초기화/수정 진입) 에디터 내용 동기화
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const incoming = value || '';
    const normalizedCurrent = current === '<p></p>' ? '' : current;
    if (incoming !== normalizedCurrent) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) {
    return (
      <div
        className="rounded-lg border border-gray-300 bg-gray-50"
        style={{ minHeight: minHeight + 44 }}
      />
    );
  }

  return (
    <div className="rounded-lg">
      <Toolbar editor={editor} onImageUpload={onImageUpload} />
      <div
        className="relative rounded-b-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-orange-500"
        style={{ minHeight }}
        onClick={() => editor.chain().focus().run()}
      >
        {editor.isEmpty && placeholder && (
          <div className="pointer-events-none absolute px-3 py-3 text-sm text-gray-400">
            {placeholder}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
