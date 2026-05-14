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
  sendMessage: async (sessionId: string, message: string): Promise<ChatResponse> => {
    const response = await apiClient.post<ChatResponse>('/chat', {
      session_id: sessionId,
      message,
    });
    return response.data;
  },

  getSuggestedQuestions: async (): Promise<SuggestedQuestionsResponse> => {
    const response = await apiClient.get<SuggestedQuestionsResponse>('/chat/suggested');
    return response.data;
  },
};

export const adminApi = {
  getSessions: async (): Promise<AdminSession[]> => {
    const response = await apiClient.get<AdminSession[]>('/admin/sessions');
    return response.data;
  },

  getSessionDetail: async (sessionId: string): Promise<AdminSessionDetail> => {
    const response = await apiClient.get<AdminSessionDetail>(`/admin/sessions/${sessionId}`);
    return response.data;
  },

  uploadPdf: async (file: File): Promise<{ message: string; document_id: number; status: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE_URL}/admin/upload-pdf`, formData);
    return response.data;
  },

  uploadMd: async (
    file: File,
    title?: string,
    category?: string,
  ): Promise<{ message: string; document_id: number; logical_name: string; status: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (category) formData.append('category', category);
    const response = await axios.post(`${API_BASE_URL}/admin/upload-md`, formData);
    return response.data;
  },

  importCatalog: async (
    catalogFile: File,
    mdFiles: File[],
  ): Promise<{ message: string; documents: { id: number; logical_name: string; status: string }[] }> => {
    const formData = new FormData();
    formData.append('catalog', catalogFile);
    mdFiles.forEach(f => formData.append('files', f));
    const response = await axios.post(`${API_BASE_URL}/admin/import-catalog`, formData);
    return response.data;
  },

  getDocuments: async (): Promise<{ documents: AdminDocument[] }> => {
    const response = await apiClient.get('/admin/documents');
    return response.data;
  },

  deleteDocument: async (documentId: number): Promise<{ message: string }> => {
    const response = await apiClient.delete(`/admin/documents/${documentId}`);
    return response.data;
  },

  retryDocument: async (documentId: number): Promise<{ message: string }> => {
    const response = await apiClient.post(`/admin/documents/${documentId}/retry`, {});
    return response.data;
  },

  reindex: async (): Promise<{ message: string; strategy: string }> => {
    const response = await apiClient.post('/admin/reindex', {});
    return response.data;
  },

  getFaqs: async (): Promise<{ faqs: AdminFaq[] }> => {
    const response = await apiClient.get('/admin/faqs');
    return response.data;
  },

  updateFaqs: async (faqs: AdminFaq[]): Promise<{ message: string }> => {
    const response = await apiClient.put('/admin/faqs', { faqs });
    return response.data;
  },

  getPrompts: async (): Promise<{ prompts: PromptConfig[] }> => {
    const response = await apiClient.get('/admin/prompts');
    return response.data;
  },

  updatePrompts: async (prompts: PromptConfig[]): Promise<{ message: string }> => {
    const response = await apiClient.put('/admin/prompts', { prompts });
    return response.data;
  },

  getLogs: async (): Promise<{ processing_logs: ProcessingLog[]; chat_logs: ChatLog[] }> => {
    const response = await apiClient.get('/admin/logs');
    return response.data;
  },
};
