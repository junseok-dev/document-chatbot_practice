export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  source?: 'faq' | 'document' | 'ai' | 'fallback';
}

export interface AdminSession {
  id: string;
  created_at: string;
  updated_at: string | null;
  message_count: number;
  user_name: string | null;
}

export interface AdminMessage {
  id: number;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  source: string | null;
  created_at: string;
}

export interface AdminSessionDetail {
  session: AdminSession;
  messages: AdminMessage[];
}

export interface SuggestedQuestion {
  id: string;
  label: string;
  query: string;
}

export interface ChatResponse {
  answer: string;
  source: 'faq' | 'document' | 'fallback';
  session_id: string;
}

export interface SuggestedQuestionsResponse {
  questions: SuggestedQuestion[];
}
