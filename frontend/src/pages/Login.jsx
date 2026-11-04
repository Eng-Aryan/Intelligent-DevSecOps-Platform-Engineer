import { useState } from 'react'; import { ShieldCheck, GitBranch, Hammer, ScanSearch, Rocket, Activity } from 'lucide-react'; import { useAuth } from '../auth'; import { api, errMsg } from '../api'; import { Field, Input, Msg } from '../components/ui';
const STEPS = [[GitBranch, 'Commit', '#60a5fa'], [Hammer, 'Build', '#a78bfa'], [ScanSearch, 'Scan', '#f97316'], [ShieldCheck, 'Gate', '#10b981'], [Rocket, 'Deploy', '#06b6d4'], [Activity, 'Monitor', '#22c55e']];
export default function Login() {
  const { login } = useAuth(); const reset = new URLSearchParams(location.search).get('reset');
  const [mode, setMode] = useState(reset ? 'reset' : 'login'); const [f, setF] = useState({ name: '', email: '', password: '' }); const [m, setM] = useState(null); const [busy, setBusy] = useState(false);
  const submit = async e => { e.preventDefault(); setBusy(true); setM(null);
    try { if (mode === 'login') await login('/auth/login', { email: f.email, password: f.password }); else if (mode === 'register') await login('/auth/register', f);
      else if (mode === 'forgot') { const r = await api.post('/auth/forgot', { email: f.email }); setM({ text: r.data.message }); }
      else { await api.post('/auth/reset', { token: reset, password: f.password }); setM({ text: 'Password set. You can sign in now.' }); setMode('login'); history.replaceState(null, '', '/login'); } }
    catch (e) { setM({ err: 1, text: errMsg(e) }); } finally { setBusy(false); } };
  const set = k => e => setF({ ...f, [k]: e.target.value });
  return <div className="min-h-full grid lg:grid-cols-2">
    <div className="hero hidden lg:flex flex-col justify-center p-14 rounded-none border-0"><div className="relative z-10 max-w-lg"><div className="flex items-center gap-3 mb-6"><ShieldCheck size={38} className="text-brand" /><span className="text-2xl font-bold grad-text">DevSecOps Hub</span></div>
      <h1 className="text-4xl font-bold leading-tight">Develop, test, secure, deploy and monitor — in one place.</h1><p className="text-muted mt-4">GitHub, Jenkins, SonarQube, Trivy, Gitleaks, Docker, Prometheus and an AI assistant working as one delivery pipeline.</p>
      <div className="mt-10 flex items-center">{STEPS.map(([I, l, c], i) => <div key={l} className="flex items-center"><div className="text-center"><div className="w-12 h-12 rounded-2xl grid place-items-center border" style={{ background: c + '22', borderColor: c + '88', color: c }}><I size={20} /></div><div className="text-[11px] mt-1 text-muted">{l}</div></div>{i < 5 && <div className="w-5 h-0.5 bg-gradient-to-r from-brand to-violet mx-1 mb-4 flow-arrow" />}</div>)}</div></div></div>
    <div className="flex items-center justify-center p-6"><form onSubmit={submit} className="card p-8 w-full max-w-sm space-y-4"><div><div className="text-xl font-semibold">{{ login: 'Welcome back', register: 'Create account', forgot: 'Reset your password', reset: 'Choose a new password' }[mode]}</div><div className="text-xs text-muted">Intelligent DevSecOps Platform</div></div>
      {mode === 'register' && <Field label="Full name"><Input value={f.name} onChange={set('name')} required minLength={2} /></Field>}
      {mode !== 'reset' && <Field label="Email"><Input type="email" value={f.email} onChange={set('email')} required autoComplete="email" /></Field>}
      {mode !== 'forgot' && <Field label="Password" hint={mode !== 'login' ? 'At least 10 characters' : ''}><Input type="password" value={f.password} onChange={set('password')} required minLength={mode === 'login' ? 1 : 10} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></Field>}
      <Msg m={m} /><button className="btn btn-primary w-full justify-center py-2.5" disabled={busy}>{busy ? 'Please wait…' : { login: 'Sign in', register: 'Register', forgot: 'Send reset link', reset: 'Set password' }[mode]}</button>
      <div className="flex justify-between text-xs text-brand">{mode !== 'login' ? <button type="button" onClick={() => setMode('login')}>Back to sign in</button> : <button type="button" onClick={() => setMode('register')}>Create account</button>}{mode === 'login' && <button type="button" onClick={() => setMode('forgot')}>Forgot password?</button>}</div>
      <p className="text-[11px] text-muted">The first registered user becomes the administrator.</p></form></div></div>;
}
