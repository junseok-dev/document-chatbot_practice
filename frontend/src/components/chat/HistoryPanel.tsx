import React, { useEffect, useRef, useState } from 'react';
import { Search, X, MessageSquare } from 'lucide-react';
import { Conversation } from '../../types';
import { useConversations } from '../../hooks/useChat';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (conv: Conversation) => void;
  currentConvId?: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}

const highlight = (text: string, keyword: string) => {
  if (!keyword.trim()) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} className="bg-brand-200 text-brand-800 rounded px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};

const getSnippet = (conv: Conversation, keyword: string): string => {
  if (!keyword.trim()) return '';
  const lower = keyword.toLowerCase();
  const match = conv.messages.find((m) => m.content.toLowerCase().includes(lower));
  if (!match) return '';
  const idx = match.content.toLowerCase().indexOf(lower);
  const start = Math.max(0, idx - 15);
  const end = Math.min(match.content.length, idx + keyword.length + 35);
  return (start > 0 ? '…' : '') + match.content.slice(start, end) + (end < match.content.length ? '…' : '');
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
};

const HistoryDropdown: React.FC<Props> = ({ open, onClose, onSelect, currentConvId, anchorRef }) => {
  const [keyword, setKeyword] = useState('');
  const { search, refresh } = useConversations();
  const [results, setResults] = useState<Conversation[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      refresh();
      setResults(search(''));
      setKeyword('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setResults(search(keyword));
  }, [keyword]);

  // outside-click: 패널과 토글 버튼 둘 다 제외
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed right-4 z-50 w-80 rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden"
      style={{ top: (anchorRef.current?.getBoundingClientRect().bottom ?? 64) + 8 }}
    >
      {/* Search input */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400 transition-all">
          <Search size={13} className="shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="키워드 입력..."
            className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder-gray-400"
          />
          {keyword && (
            <button onClick={() => setKeyword('')} className="text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="max-h-64 overflow-y-auto">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-gray-400">
            <MessageSquare size={24} strokeWidth={1.5} />
            <p className="text-xs">{keyword ? '검색 결과가 없습니다' : '대화 기록이 없습니다'}</p>
          </div>
        ) : (
          <ul className="pb-2">
            {results.map((conv) => {
              const snippet = getSnippet(conv, keyword);
              const isActive = conv.id === currentConvId;
              return (
                <li key={conv.id}>
                  <button
                    onClick={() => { onSelect(conv); onClose(); }}
                    className={`w-full text-left px-4 py-2.5 transition-colors hover:bg-gray-50 ${isActive ? 'bg-brand-50 border-l-2 border-l-brand-500' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-gray-800 line-clamp-1 flex-1">
                        {highlight(conv.title, keyword)}
                      </p>
                      <span className="shrink-0 text-[10px] text-gray-400">{formatDate(conv.startedAt)}</span>
                    </div>
                    {snippet && (
                      <p className="mt-0.5 text-[11px] text-gray-500 line-clamp-1">{highlight(snippet, keyword)}</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default HistoryDropdown;
