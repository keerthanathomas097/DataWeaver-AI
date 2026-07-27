import client from './client';

export async function signup({ email, password, full_name }) {
  const { data } = await client.post('/auth/signup', { email, password, full_name });
  return data;
}

export async function login({ email, password }) {
  const { data } = await client.post('/auth/login', { email, password });
  return data;
}

export async function getMe() {
  const { data } = await client.get('/auth/me');
  return data;
}

export async function forgotPassword({ email }) {
  const { data } = await client.post('/auth/forgot-password', { email });
  return data;
}

export async function resetPassword({ token, new_password }) {
  const { data } = await client.post('/auth/reset-password', { token, new_password });
  return data;
}

export async function getUsers() {
  const { data } = await client.get('/auth/users');
  return data;
}

export async function toggleAdmin(userId) {
  const { data } = await client.put(`/auth/users/${userId}/toggle-admin`);
  return data;
}

export function getAuthErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(', ');
  }
  return 'Something went wrong. Please try again.';
}
