const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = (path) => request(path, { method: 'DELETE' });

export const api = {
  auth: {
    me: () => get('/auth/me'),
    login: (email, password) => post('/auth/login', { email, password }),
    logout: () => post('/auth/logout', {}),
    register: (name, email, password) => post('/auth/register', { name, email, password }),
    forgotPassword: (email) => post('/auth/forgot-password', { email }),
    resetPassword: (token, password) => post('/auth/reset-password', { token, password }),
  },
  projects: {
    list: (status) => get(`/projects${status ? `?status=${status}` : ''}`),
    create: (data) => post('/projects', data),
    update: (id, data) => put(`/projects/${id}`, data),
    remove: (id) => del(`/projects/${id}`),
    setLead: (id, stakeholder_id) => put(`/projects/${id}/lead`, { stakeholder_id }),
    stakeholders: (id) => get(`/projects/${id}/stakeholders`),
    assignStakeholder: (id, stakeholder_id, project_role) =>
      post(`/projects/${id}/stakeholders`, { stakeholder_id, project_role }),
    setStakeholderRole: (id, stakeholderId, project_role) =>
      patch(`/projects/${id}/stakeholders/${stakeholderId}`, { project_role }),
    removeStakeholder: (id, stakeholderId) => del(`/projects/${id}/stakeholders/${stakeholderId}`),
  },
  stakeholders: {
    list: () => get('/stakeholders'),
    create: (data) => post('/stakeholders', data),
    update: (id, data) => put(`/stakeholders/${id}`, data),
    remove: (id) => del(`/stakeholders/${id}`),
  },
  events: {
    list: (projectIds) => get(`/events?project_ids=${projectIds.join(',')}`),
    create: (data) => post('/events', data),
    update: (id, data) => put(`/events/${id}`, data),
    remove: (id) => del(`/events/${id}`),
    import: (project_id, csv, commit = false) => post('/events/import', { project_id, csv, commit }),
  },
  decisions: {
    create: (data) => post('/decisions', data),
    update: (id, data) => put(`/decisions/${id}`, data),
    remove: (id) => del(`/decisions/${id}`),
  },
  actionItems: {
    create: (data) => post('/action-items', data),
    update: (id, data) => put(`/action-items/${id}`, data),
    toggleDone: (id, done) => patch(`/action-items/${id}`, { done }),
    remove: (id) => del(`/action-items/${id}`),
  },
  painPoints: {
    create: (data) => post('/pain-points', data),
    update: (id, data) => put(`/pain-points/${id}`, data),
    toggleResolved: (id, resolved) => patch(`/pain-points/${id}`, { resolved }),
    remove: (id) => del(`/pain-points/${id}`),
  },
  requirements: {
    create: (data) => post('/requirements', data),
    update: (id, data) => put(`/requirements/${id}`, data),
    toggleDone: (id, done) => patch(`/requirements/${id}`, { done }),
    remove: (id) => del(`/requirements/${id}`),
  },
  goals: {
    create: (data) => post('/goals', data),
    update: (id, data) => put(`/goals/${id}`, data),
    toggleAchieved: (id, achieved) => patch(`/goals/${id}`, { achieved }),
    remove: (id) => del(`/goals/${id}`),
  },
  dashboard: {
    summary: (projectIds) =>
      get(`/dashboard/summary${projectIds?.length ? `?project_ids=${projectIds.join(',')}` : ''}`),
  },
  members: {
    list: () => get('/members'),
    create: (data) => post('/members', data),
    update: (id, data) => put(`/members/${id}`, data),
    remove: (id) => del(`/members/${id}`),
    projects: (id) => get(`/members/${id}/projects`),
    subscribe: (id, project_id) => post(`/members/${id}/projects`, { project_id }),
    unsubscribe: (id, projectId) => del(`/members/${id}/projects/${projectId}`),
  },
  notifications: {
    list: (limit) => get(`/notifications${limit ? `?limit=${limit}` : ''}`),
    runDigest: () => post('/notifications/run-digest', {}),
  },
};
