import axios from 'axios';

const TOKEN_KEY = 'dw_access_token';

const client = axios.create({
  baseURL: 'http://localhost:8000',
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default client;
