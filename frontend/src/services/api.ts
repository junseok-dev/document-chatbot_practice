import axios from 'axios';
import {
  AdminDocument,
  AdminFaq,
  AdminSession,
  AdminSessionDetail,
  ChatLog,
  ChatResponse,
  ProcessingLog,
  PromptConfig,
  SuggestedQuestionsResponse,
} from '../types';

const API_BASE_URL = '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const chatApi = {
  sendMessage: async (sessionId: string, message: string, userName?: string): Promise<ChatResponse> => {
    const response = await apiClient.post<ChatResponse>('/chat', {
      session_id: sessionId,
      message,
      user_name: userName,
    });
    return response.data;
  },

  getSuggestedQuestions: async (): Promise<SuggestedQuestionsResponse> => {
    const response = await apiClient.get<SuggestedQuestionsResponse>('/chat/suggested');
    return response.data;
  },
};

export const adminApi = {
  getSessions: async (password: string): Promise<AdminSession[]> => {
    const response = await apiClient.get<AdminSession[]>('/admin/sessions', {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  getSessionDetail: async (password: string, sessionId: string): Promise<AdminSessionDetail> => {
    const response = await apiClient.get<AdminSessionDetail>(`/admin/sessions/${sessionId}`, {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  uploadPdf: async (password: string, file: File): Promise<{ message: string; document_id: number; status: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE_URL}/admin/upload-pdf`, formData, {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  getDocuments: async (password: string): Promise<{ documents: AdminDocument[] }> => {
    const response = await apiClient.get('/admin/documents', {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  deleteDocument: async (password: string, documentId: number): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/admin/documents/${documentId}`, {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  retryDocument: async (password: string, documentId: number): Promise<{ message: string }> => {
    const response = await apiClient.post(`/admin/documents/${documentId}/retry`, {}, {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  reindex: async (password: string): Promise<{ message: string; strategy: string }> => {
    const response = await apiClient.post('/admin/reindex', {}, {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  getFaqs: async (password: string): Promise<{ faqs: AdminFaq[] }> => {
    const response = await apiClient.get('/admin/faqs', {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  updateFaqs: async (password: string, faqs: AdminFaq[]): Promise<{ message: string }> => {
    const response = await apiClient.put('/admin/faqs', { faqs }, {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  getPrompts: async (password: string): Promise<{ prompts: PromptConfig[] }> => {
    const response = await apiClient.get('/admin/prompts', {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  updatePrompts: async (password: string, prompts: PromptConfig[]): Promise<{ message: string }> => {
    const response = await apiClient.put('/admin/prompts', { prompts }, {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  getLogs: async (password: string): Promise<{ processing_logs: ProcessingLog[]; chat_logs: ChatLog[] }> => {
    const response = await apiClient.get('/admin/logs', {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },

  changePassword: async (password: string, newPassword: string): Promise<{ message: string }> => {
    const response = await apiClient.put('/admin/password',
      { new_password: newPassword },
      { headers: { 'x-admin-password': password } }
    );
    return response.data;
  },
};
