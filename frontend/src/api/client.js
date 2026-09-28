import { supabase } from '../lib/supabase.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return headers;
}

async function request(path, options = {}) {
  let response;
  try {
    const headers = await getAuthHeaders();
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...headers, ...options.headers },
    });
  } catch {
    throw new Error('Cannot reach the Notice Me API. Start the backend and try again.');
  }
  if (response.status === 204) return null;
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message || `Request failed (${response.status}).`);
  return result;
}

export const listTopics = async () => (await request('/api/topics')).topics;
export const createTopic = async (fields) => (await request('/api/topics', { method: 'POST', body: JSON.stringify(fields) })).topic;
export const deleteTopic = (id) => request(`/api/topics/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const getTimeline = (id) => request(`/api/topics/${encodeURIComponent(id)}/timeline`);
export const getLatestSnapshot = (id) => request(`/api/topics/${encodeURIComponent(id)}/snapshots/latest`);
export const updateAlertSettings = async (id, settings) => (await request(`/api/topics/${encodeURIComponent(id)}/alert-settings`, {
  method: 'POST', body: JSON.stringify(settings),
})).topic;
export const searchTopics = async (q) => request(`/api/topics/search?q=${encodeURIComponent(q)}`);
export const getProfile = async () => (await request('/api/user/me'));
