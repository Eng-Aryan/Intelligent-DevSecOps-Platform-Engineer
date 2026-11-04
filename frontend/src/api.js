import axios from 'axios';
export const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(c => { const t = localStorage.getItem('token'); if (t) c.headers.Authorization = 'Bearer ' + t; return c; });
api.interceptors.response.use(r => r, e => { if (e.response?.status === 401 && !location.pathname.startsWith('/login')) { localStorage.removeItem('token'); location.href = '/login'; } return Promise.reject(e); });
export const errMsg = e => (e.response?.data?.reasons ? e.response.data.error + ': ' + e.response.data.reasons.join('; ') : e.response?.data?.error || e.message);
