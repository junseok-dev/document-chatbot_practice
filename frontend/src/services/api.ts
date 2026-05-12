import axios from 'axios';
import { ChatResponse, SuggestedQuestionsResponse, AdminSession, AdminSessionDetail } from '../types';

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

  uploadPdf: async (password: string, file: File): Promise<{ message: string; md_file: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API_BASE_URL}/admin/upload-pdf`, formData, {
      headers: { 'x-admin-password': password },
    });
    return response.data;
  },
};
