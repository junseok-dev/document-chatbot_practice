import React from 'react';
import { SuggestedQuestion } from '../../types';

interface Props {
  questions: SuggestedQuestion[];
  onSelect: (query: string) => void;
  disabled: boolean;
}

const ACTION_IDS = new Set<string>();

const SuggestedQuestions: React.FC<Props> = ({ questions, onSelect, disabled }) => {
  if (!questions.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-6">
      {questions.map((q) => {
        const isAction = ACTION_IDS.has(q.id);

        if (q.url) {
          return (
            <a
              key={q.id}
              href={q.url}
              target="_blank"
              rel="noreferrer"
              className="bg-amber-500 border border-amber-500 text-white px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-amber-600 hover:border-amber-600 transition-all shadow-sm whitespace-nowrap"
            >
              {q.label}
            </a>
          );
        }

        return (
          <button
            key={q.id}
            onClick={() => onSelect(q.query)}
            disabled={disabled}
            className={
              isAction
                ? 'bg-amber-500 border border-amber-500 text-white px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-amber-600 hover:border-amber-600 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'
                : 'bg-white border border-brand-200 text-brand-700 px-3.5 py-1.5 rounded-full text-[13px] font-medium hover:bg-brand-50 hover:border-brand-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap'
            }
          >
            {q.label}
          </button>
        );
      })}
    </div>
  );
};

export default SuggestedQuestions;
