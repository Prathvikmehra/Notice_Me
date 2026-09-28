const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
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
export const setAlertEmail = async (id, email) => (await request(`/api/topics/${encodeURIComponent(id)}/alert-settings`, {
  method: 'POST', body: JSON.stringify({ email }),
})).topic;
