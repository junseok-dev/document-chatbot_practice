import axios from 'axios';
import {
  AdminDocument,
  AdminDocumentDetail,
  AdminFaq,
  AdminSession,
  AuditLog,
  AdminSessionDetail,
  ChatLog,
  ChatResponse,
  CustomColumnDef,
  CustomRowData,
  CustomTableDetail,
  CustomTableSummary,
  ProcessingLog,
  PromptConfig,
  PromptPayload,
  SuggestedQuestionsResponse,
} from '../types';

const API_BASE_URL = '/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

const ADMIN_PWD_KEY = 'adminPassword';
export const getAdminPassword = (): string => sessionStorage.getItem(ADMIN_PWD_KEY) ?? '';
export const saveAdminPassword = (password: string) => sessionStorage.setItem(ADMIN_PWD_KEY, password);
export const clearAdminPassword = () => sessionStorage.removeItem(ADMIN_PWD_KEY);

const adminApiClient = axios.create({ baseURL: API_BASE_URL });
adminApiClient.interceptors.request.use((config) => {
  const pwd = getAdminPassword();
  if (pwd) config.headers['X-Admin-Password'] = pwd;
  return config;
});

export const chatApi = {
  sendMessage: async (sessionId: string, message: string): Promise<ChatResponse> => {
    const response = await apiClient.post<ChatResponse>('/chat', {
      session_id: sessionId,
      message,
    });
    return response.data;
  },

  streamMessage: async (
    sessionId: string,
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    onToken: (token: string) => void,
    onDone: (source: string, handoffUrl: string | null) => void,
    onError: () => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    try {
      const response = await fetch(`${API_BASE_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, message, history }),
        signal,
      });

      if (!response.ok || !response.body) {
        onError();
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));
          if (data.token !== undefined) {
            onToken(data.token);
          }
          if (data.done) {
            onDone(data.source ?? 'faq', data.handoff_url ?? null);
          }
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      onError();
    }
  },

  getSuggestedQuestions: async (): Promise<SuggestedQuestionsResponse> => {
    const response = await apiClient.get<SuggestedQuestionsResponse>('/chat/suggested');
    return response.data;
  },
};

export const adminApi = {
  getSessions: async (): Promise<AdminSession[]> => {
    const response = await adminApiClient.get<AdminSession[]>('/admin/sessions');
    return response.data;
  },

  getSessionDetail: async (sessionId: string): Promise<AdminSessionDetail> => {
    const response = await adminApiClient.get<AdminSessionDetail>(`/admin/sessions/${sessionId}`);
    return response.data;
  },

  uploadPdf: async (file: File): Promise<{ message: string; document: AdminDocument }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await adminApiClient.post('/admin/upload-pdf', formData);
    return response.data;
  },

  uploadMd: async (
    file: File,
    title?: string,
    category?: string,
  ): Promise<{ message: string; document: AdminDocument }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);
    if (category) formData.append('category', category);
    const response = await adminApiClient.post('/admin/upload-md', formData);
    return response.data;
  },

  uploadFaqMd: async (
    file: File,
    category?: string,
  ): Promise<{ message: string; document: AdminDocument; faqs: AdminFaq[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    if (category) formData.append('category', category);
    const response = await adminApiClient.post('/admin/upload-faq-md', formData);
    return response.data;
  },

  importCatalog: async (
    catalogFile: File,
    mdFiles: File[],
  ): Promise<{ message: string; documents: { id: number; logical_name: string; status: string }[] }> => {
    const formData = new FormData();
    formData.append('catalog', catalogFile);
    mdFiles.forEach(f => formData.append('files', f));
    const response = await adminApiClient.post('/admin/import-catalog', formData);
    return response.data;
  },

  getDocuments: async (): Promise<{ documents: AdminDocument[] }> => {
    const response = await adminApiClient.get('/admin/documents');
    return response.data;
  },

  getDocumentDetail: async (documentId: number): Promise<AdminDocumentDetail> => {
    const response = await adminApiClient.get(`/admin/documents/${documentId}`);
    return response.data;
  },

  approveDocument: async (documentId: number, note?: string): Promise<{ message: string; document: AdminDocument }> => {
    const response = await adminApiClient.post(`/admin/documents/${documentId}/approve`, { note });
    return response.data;
  },

  rejectDocument: async (documentId: number, note?: string): Promise<{ message: string; document: AdminDocument }> => {
    const response = await adminApiClient.post(`/admin/documents/${documentId}/reject`, { note });
    return response.data;
  },

  restoreDocument: async (documentId: number): Promise<{ message: string; document: AdminDocument }> => {
    const response = await adminApiClient.post(`/admin/documents/${documentId}/restore`, {});
    return response.data;
  },

  deleteDocument: async (documentId: number, note?: string): Promise<{ message: string; document: AdminDocument }> => {
    const response = await adminApiClient.delete(`/admin/documents/${documentId}`, { params: note ? { note } : undefined });
    return response.data;
  },

  retryDocument: async (documentId: number): Promise<{ message: string }> => {
    const response = await adminApiClient.post(`/admin/documents/${documentId}/retry`, {});
    return response.data;
  },

  reindex: async (): Promise<{ message: string; strategy: string }> => {
    const response = await adminApiClient.post('/admin/reindex', {});
    return response.data;
  },

  getFaqs: async (): Promise<{ faqs: AdminFaq[] }> => {
    const response = await adminApiClient.get('/admin/faqs');
    return response.data;
  },

  createFaq: async (faq: AdminFaq): Promise<{ message: string; faq: AdminFaq }> => {
    const response = await adminApiClient.post('/admin/faqs', faq);
    return response.data;
  },

  updateFaq: async (faq: AdminFaq): Promise<{ message: string; faq: AdminFaq }> => {
    const response = await adminApiClient.put(`/admin/faqs/${faq.id}`, faq);
    return response.data;
  },

  deleteFaq: async (faqId: string): Promise<{ message: string }> => {
    const response = await adminApiClient.delete(`/admin/faqs/${faqId}`);
    return response.data;
  },

  getPrompts: async (): Promise<{ prompts: PromptConfig[] }> => {
    const response = await adminApiClient.get('/admin/prompts');
    return response.data;
  },

  createPrompt: async (prompt: PromptPayload): Promise<{ message: string; prompt: PromptConfig }> => {
    const response = await adminApiClient.post('/admin/prompts', prompt);
    return response.data;
  },

  updatePrompt: async (prompt: PromptPayload): Promise<{ message: string; prompt: PromptConfig }> => {
    const response = await adminApiClient.put(`/admin/prompts/${prompt.prompt_key}`, prompt);
    return response.data;
  },

  deletePrompt: async (promptKey: string): Promise<{ message: string }> => {
    const response = await adminApiClient.delete(`/admin/prompts/${promptKey}`);
    return response.data;
  },

  getLogs: async (): Promise<{ processing_logs: ProcessingLog[]; chat_logs: ChatLog[]; audit_logs: AuditLog[] }> => {
    const response = await adminApiClient.get('/admin/logs');
    return response.data;
  },

  getAuditLogs: async (): Promise<{ audit_logs: AuditLog[] }> => {
    const response = await adminApiClient.get('/admin/audit-logs');
    return response.data;
  },

  getChatLogs: async (params?: { start_date?: string; end_date?: string; session_id?: string }): Promise<{ chat_logs: ChatLog[] }> => {
    const response = await adminApiClient.get('/admin/chat-logs', { params });
    return response.data;
  },

  exportChatLogs: async (params?: { start_date?: string; end_date?: string; session_id?: string }): Promise<Blob> => {
    const response = await adminApiClient.get('/admin/chat-logs/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  },

  // 커스텀 데이터 테이블
  getDataTables: async (): Promise<{ tables: CustomTableSummary[] }> => {
    const response = await adminApiClient.get('/admin/data-tables');
    return response.data;
  },

  createDataTable: async (name: string, description: string): Promise<CustomTableSummary> => {
    const response = await adminApiClient.post('/admin/data-tables', { name, description });
    return response.data;
  },

  deleteDataTable: async (tableId: number): Promise<void> => {
    await adminApiClient.delete(`/admin/data-tables/${tableId}`);
  },

  getDataTable: async (tableId: number): Promise<CustomTableDetail> => {
    const response = await adminApiClient.get(`/admin/data-tables/${tableId}`);
    return response.data;
  },

  addColumn: async (tableId: number, column_name: string, column_type: string): Promise<CustomColumnDef> => {
    const response = await adminApiClient.post(`/admin/data-tables/${tableId}/columns`, { column_name, column_type });
    return response.data;
  },

  deleteColumn: async (tableId: number, columnId: number): Promise<void> => {
    await adminApiClient.delete(`/admin/data-tables/${tableId}/columns/${columnId}`);
  },

  addRow: async (tableId: number, data: Record<string, string>): Promise<CustomRowData> => {
    const response = await adminApiClient.post(`/admin/data-tables/${tableId}/rows`, { data });
    return response.data;
  },

  updateRow: async (tableId: number, rowId: number, data: Record<string, string>): Promise<CustomRowData> => {
    const response = await adminApiClient.put(`/admin/data-tables/${tableId}/rows/${rowId}`, { data });
    return response.data;
  },

  deleteRow: async (tableId: number, rowId: number): Promise<void> => {
    await adminApiClient.delete(`/admin/data-tables/${tableId}/rows/${rowId}`);
  },

  exportDataTable: async (tableId: number, tableName: string): Promise<void> => {
    const response = await adminApiClient.get(`/admin/data-tables/${tableId}/export`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tableName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  },
};
