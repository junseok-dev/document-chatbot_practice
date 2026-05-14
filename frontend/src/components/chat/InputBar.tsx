import React, { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';

interface Props {
  onSendMessage: (message: string) => void;
  isLoading: boolean;
}

const InputBar: React.FC<Props> = ({ onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }
  }, [input]);

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-2">
      <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 focus-within:border-brand-400 focus-within:ring-1 focus-within:ring-brand-400 transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요"
          disabled={isLoading}
          className="flex-1 max-h-[100px] min-h-[22px] resize-none bg-transparent border-none text-[14px] leading-relaxed focus:outline-none focus:ring-0 disabled:opacity-50 placeholder-gray-400"
          rows={1}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="shrink-0 flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-600 disabled:bg-gray-200 disabled:cursor-not-allowed"
          aria-label="전송"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={15} />
          )}
        </button>
      </div>
      <p className="mt-1.5 text-center text-[10px] text-gray-400">
        엔코아AI캠퍼스 상담 챗봇은 실수가 있을 수 있습니다. 중요한 정보는 담당자에게 재확인 바랍니다.
      </p>
    </div>
  );
};

export default InputBar;
