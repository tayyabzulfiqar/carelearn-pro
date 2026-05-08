import api from '@/lib/api';

function unwrap(response) {
  if (response?.data?.success) return response.data.data;
  return response?.data;
}

export async function cmsGet(path, config = {}) {
  const res = await api.get(`/admin/cms${path}`, config);
  return unwrap(res);
}

export async function cmsPost(path, payload = {}) {
  const res = await api.post(`/admin/cms${path}`, payload);
  return unwrap(res);
}

export async function cmsPut(path, payload = {}) {
  const res = await api.put(`/admin/cms${path}`, payload);
  return unwrap(res);
}

export async function cmsDelete(path) {
  const res = await api.delete(`/admin/cms${path}`);
  return unwrap(res);
}