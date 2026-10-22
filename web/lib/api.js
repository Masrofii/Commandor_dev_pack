'use client';
const API_URL = process.env.NEXT_PUBLIC_API_URL !== undefined ? process.env.NEXT_PUBLIC_API_URL : '';
function getToken(){try{return typeof window!=='undefined'?localStorage.getItem('session_token'):null;}catch{return null;}}

function toQueryString(params = {}) {
  const clean = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '' && v !== 'undefined' && v !== 'null') {
      clean[k] = v;
    }
  }
  const q = new URLSearchParams(clean).toString();
  return q ? `?${q}` : '';
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers
  };
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers, credentials: 'include' });
  if (res.status === 401) {
    localStorage.removeItem('session_token');
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new Error('Session expired');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `API error ${res.status}`);
  return data;
}

export const api = {
  loginWithToken: (token) => apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ token }) }),
  loginWithTelegram: (i, t) => apiFetch('/api/auth/telegram', { method: 'POST', body: JSON.stringify({ initData: i, totpToken: t }) }),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
  updateProfile: (d) => apiFetch('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(d) }),
  getAliases: (p = {}) => apiFetch('/api/aliases' + toQueryString(p)),
  createAlias: (d) => apiFetch('/api/aliases', { method: 'POST', body: JSON.stringify(d) }),
  createBurner: (domain) => apiFetch('/api/aliases/burner', { method: 'POST', body: JSON.stringify({ domain }) }),
  deleteAlias: (a) => apiFetch(`/api/aliases/${encodeURIComponent(a)}`, { method: 'DELETE' }),
  renewAlias: (a, minutes = 60) => apiFetch(`/api/aliases/${encodeURIComponent(a)}/renew`, { method: 'POST', body: JSON.stringify({ minutes }) }),
  updateAlias: (a, d) => apiFetch(`/api/aliases/${encodeURIComponent(a)}`, { method: 'PATCH', body: JSON.stringify(d) }),
  getAliasQr: (a) => `${API_URL}/api/aliases/${encodeURIComponent(a)}/qr`,
  bulkAliasAction: (addresses, action) => apiFetch('/api/aliases/bulk', { method: 'POST', body: JSON.stringify({ addresses, action }) }),
  getDomains: () => apiFetch('/api/aliases/domains'),
  getEmails: (p = {}) => apiFetch('/api/emails' + toQueryString(p)),
  getEmail: (id) => apiFetch(`/api/emails/${id}`),
  markRead: (id) => apiFetch(`/api/emails/${id}/read`, { method: 'PATCH' }),
  starEmail: (id, starred) => apiFetch(`/api/emails/${id}/star`, { method: 'PATCH', body: JSON.stringify({ starred }) }),
  deleteEmail: (id) => apiFetch(`/api/emails/${id}`, { method: 'DELETE' }),
  sendReply: (emailId, text, html) => apiFetch('/api/replies', { method: 'POST', body: JSON.stringify({ emailId, text, html }) }),
  getAttachmentUrl: (id) => `${API_URL}/api/attachments/${id}`,
  getWebhooks: () => apiFetch('/api/webhooks'),
  createWebhook: (d) => apiFetch('/api/webhooks', { method: 'POST', body: JSON.stringify(d) }),
  deleteWebhook: (id) => apiFetch(`/api/webhooks/${id}`, { method: 'DELETE' }),
  getWebhookDeliveries: (id) => apiFetch(`/api/webhooks/${id}/deliveries`),
  getSessions: () => apiFetch('/api/sessions'),
  revokeSession: (id) => apiFetch(`/api/sessions/${id}`, { method: 'DELETE' }),
  revokeAllSessions: () => apiFetch('/api/sessions', { method: 'DELETE' }),
  getApiKeys: () => apiFetch('/api/api-keys'),
  createApiKey: (name, scopes) => apiFetch('/api/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes }) }),
  revokeApiKey: (id) => apiFetch(`/api/api-keys/${id}`, { method: 'DELETE' }),
  getContacts: (s) => apiFetch('/api/contacts' + (s ? `?search=${encodeURIComponent(s)}` : '')),
  createContact: (d) => apiFetch('/api/contacts', { method: 'POST', body: JSON.stringify(d) }),
  deleteContact: (id) => apiFetch(`/api/contacts/${id}`, { method: 'DELETE' }),
  getDomainList: () => apiFetch('/api/domains'),
  addDomain: (domain) => apiFetch('/api/domains', { method: 'POST', body: JSON.stringify({ domain }) }),
  verifyDomain: (id) => apiFetch(`/api/domains/${id}/verify`, { method: 'POST' }),
  getDomainHealth: (id) => apiFetch(`/api/domains/${id}/health`),
  deleteDomain: (id) => apiFetch(`/api/domains/${id}`, { method: 'DELETE' }),
  startExport: (format, filters) => apiFetch('/api/export', { method: 'POST', body: JSON.stringify({ format, filters }) }),
  getExportJob: (id) => apiFetch(`/api/export/${id}`),
  getExportDownloadUrl: (id) => `${API_URL}/api/export/${id}/download`,
  getAutomations: () => apiFetch('/api/automations'),
  createAutomation: (d) => apiFetch('/api/automations', { method: 'POST', body: JSON.stringify(d) }),
  deleteAutomation: (id) => apiFetch(`/api/automations/${id}`, { method: 'DELETE' }),
  getAdminUsers: (p) => apiFetch('/api/admin/users' + toQueryString(p)),
  updateUser: (tgId, d) => apiFetch(`/api/admin/users/${tgId}`, { method: 'PATCH', body: JSON.stringify(d) }),
  getAuditLogs: (p) => apiFetch('/api/admin/logs' + toQueryString(p)),
  getAdminStats: () => apiFetch('/api/admin/stats'),
  getAdminEmails: (p = {}) => apiFetch('/api/admin/emails' + toQueryString(p)),
  deleteAdminEmail: (id) => apiFetch(`/api/admin/emails/${id}`, { method: 'DELETE' }),
  getAdminAliases: (p = {}) => apiFetch('/api/admin/aliases' + toQueryString(p)),
  getAdminSubdomains: (p = {}) => apiFetch('/api/admin/subdomains' + toQueryString(p)),
  updateAdminSubdomain: (id, d) => apiFetch(`/api/admin/subdomains/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  deleteAdminSubdomain: (id) => apiFetch(`/api/admin/subdomains/${id}`, { method: 'DELETE' }),
  getAdminSites: (p = {}) => apiFetch('/api/admin/sites' + toQueryString(p)),
  deleteAdminSite: (id) => apiFetch(`/api/admin/sites/${id}`, { method: 'DELETE' }),
  getAdminNodes: () => apiFetch('/api/admin/nodes'),
  addAdminNode: (d) => apiFetch('/api/admin/nodes', { method: 'POST', body: JSON.stringify(d) }),
  addAdminNodesBulk: (d) => apiFetch('/api/admin/nodes/bulk', { method: 'POST', body: JSON.stringify(d) }),
  deleteAdminNode: (id) => apiFetch(`/api/admin/nodes/${id}`, { method: 'DELETE' }),
  getAdminSecurityLogs: (p = {}) => apiFetch('/api/admin/security-logs' + toQueryString(p)),
  sendAdminBroadcast: (d) => apiFetch('/api/admin/broadcast', { method: 'POST', body: JSON.stringify(d) }),
  vacuumDatabase: () => apiFetch('/api/admin/system/vacuum', { method: 'POST' }),
  getSubdomains: (p = {}) => apiFetch('/api/subdomains' + toQueryString(p)),
  claimSubdomain: (d) => apiFetch('/api/subdomains', { method: 'POST', body: JSON.stringify(d) }),
  updateSubdomain: (id, d) => apiFetch(`/api/subdomains/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  deleteSubdomain: (id) => apiFetch(`/api/subdomains/${id}`, { method: 'DELETE' }),
  getSubdomainRequests: (id) => apiFetch(`/api/subdomains/${id}/requests`),
  checkSubdomain: (name) => apiFetch(`/api/subdomains/check/${encodeURIComponent(name)}`),
  getSubdomainBases: () => apiFetch('/api/subdomains/bases'),
  // Hosting & Nodes
  getHostingTOS: () => apiFetch('/api/hosting/tos'),
  getHostingPlans: () => apiFetch('/api/hosting/plans'),
  getHostingLimits: () => apiFetch('/api/hosting/limits'),
  getHostingSites: () => apiFetch('/api/hosting/sites'),
  getHostingSite: (id) => apiFetch(`/api/hosting/sites/${id}`),
  deployHostingSite: (data) => apiFetch('/api/hosting/sites', {
    method: 'POST',
    body: typeof FormData !== 'undefined' && data instanceof FormData ? data : JSON.stringify(data)
  }),
  deleteHostingSite: (id) => apiFetch(`/api/hosting/sites/${id}`, { method: 'DELETE' }),
  getHostingNodes: () => apiFetch('/api/hosting/nodes'),
  getNodeWithSites: (id) => apiFetch(`/api/hosting/nodes/${id}`),
  pingHostingNode: (id) => apiFetch(`/api/hosting/nodes/${id}/ping`, { method: 'POST' }),
  execNodeCommand: (id, command) => apiFetch(`/api/hosting/nodes/${id}/exec`, { method: 'POST', body: JSON.stringify({ command }) }),
  addHostingNode: (data) => apiFetch('/api/hosting/nodes', { method: 'POST', body: JSON.stringify(data) }),
  addHostingNodesBulk: (data) => apiFetch('/api/hosting/nodes/bulk', { method: 'POST', body: JSON.stringify(data) }),
  deleteHostingNode: (id) => apiFetch(`/api/hosting/nodes/${id}`, { method: 'DELETE' }),
  getHostingSecurityLogs: (p = {}) => apiFetch('/api/hosting/security-logs' + toQueryString(p))
};

export default api;
