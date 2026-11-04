import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api';
const Ctx = createContext(null); export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); const [loading, setLoading] = useState(!!localStorage.getItem('token'));
  const [project, setProject] = useState(localStorage.getItem('project') || '');
  useEffect(() => { if (localStorage.getItem('token')) api.get('/auth/me').then(r => setUser(r.data)).catch(() => localStorage.removeItem('token')).finally(() => setLoading(false)); }, []);
  const login = useCallback(async (path, body) => { const { data } = await api.post(path, body); localStorage.setItem('token', data.token); setUser(data.user); }, []);
  const logout = useCallback(async () => { try { await api.post('/auth/logout'); } catch {} localStorage.removeItem('token'); setUser(null); }, []);
  const pick = p => { setProject(p); localStorage.setItem('project', p); };
  const can = (...roles) => user && roles.includes(user.role);
  return <Ctx.Provider value={{ user, setUser, loading, login, logout, project, pick, can }}>{children}</Ctx.Provider>;
}
