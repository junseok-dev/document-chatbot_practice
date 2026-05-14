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
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  return (
    <div className="bg-white border-t border-gray-100 p-4 shrink-0">
      <div className="max-w-4xl mx-auto flex items-end gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-200 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 transition-all shadow-sm">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="궁금한 점을 자유롭게 물어보세요... (Shift+Enter로 줄바꿈)"
          disabled={isLoading}
          className="flex-1 max-h-[120px] min-h-[24px] bg-transparent border-none resize-none px-3 py-2 text-[15px] focus:outline-none focus:ring-0 disabled:opacity-50 placeholder-gray-400"
          rows={1}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className="shrink-0 bg-brand-600 text-white p-3 rounded-xl hover:bg-brand-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed shadow-sm h-11 w-11 flex items-center justify-center group"
          aria-label="메시지 전송"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={18} className="transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          )}
        </button>
      </div>
      <div className="text-center mt-2">
        <span className="text-[11px] text-gray-400 font-medium">
          Playdata Chatbot은 실수가 있을 수 있습니다. 중요한 정보는 담당자에게 재확인 바랍니다.
        </span>
      </div>
    </div>
  );
};

export default InputBar;
