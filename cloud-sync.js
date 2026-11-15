(() => {
  const config = window.CASHBOARD_SUPABASE || {};
  const url = String(config.url || '').replace(/\/$/, '');
  const key = String(config.publishableKey || '');
  const enabled = Boolean(url && key);
  const SESSION_KEY = 'cashboard.cloud.session.v1';
  let session = null;

  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch {}

  function saveSession(value) {
    session = value;
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  }

  async function request(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
    if (!enabled) throw new Error('A sincronização na nuvem ainda não foi configurada.');
    const token = auth ? await accessToken() : key;
    const response = await fetch(`${url}${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.hint || `Falha na nuvem (${response.status}).`);
    return data;
  }

  async function authRequest(path, body) {
    const data = await request(`/auth/v1/${path}`, { method: 'POST', body, auth: false });
    const authData = data?.session || data;
    if (authData?.access_token) saveSession({ ...authData, user: authData.user || data.user, expires_at: authData.expires_at || Math.floor(Date.now() / 1000) + Number(authData.expires_in || 3600) });
    return data;
  }

  async function accessToken() {
    if (!session?.access_token) throw new Error('Entre na sua conta para sincronizar os dados.');
    if (Number(session.expires_at || 0) > Math.floor(Date.now() / 1000) + 60) return session.access_token;
    if (!session.refresh_token) { saveSession(null); throw new Error('Sua sessão expirou. Entre novamente.'); }
    const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: { refresh_token: session.refresh_token }, auth: false
    });
    saveSession({ ...refreshed, expires_at: refreshed.expires_at || Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600) });
    return session.access_token;
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  function normalizeExpense(item, userId) {
    const id = uuidPattern.test(String(item.id || '')) ? item.id : crypto.randomUUID();
    return {
      id, user_id: userId, description: item.description, amount: Number(item.amount), date: item.date,
      due_date: item.dueDate || null, notes: item.notes || '', kind: item.kind || (item.type === 'installment' ? 'installment' : 'variable'),
      flow: item.flow || 'expense', installments: Number(item.installments) || 1, paid: Boolean(item.paid), paid_months: item.paidMonths || {},
      type: item.type || ((item.kind === 'installment') ? 'installment' : 'cash'), updated_at: new Date().toISOString()
    };
  }
  function localExpense(row) {
    return { id: row.id, description: row.description, amount: Number(row.amount), date: row.date,
      dueDate: row.due_date || '', notes: row.notes || '', kind: row.kind, flow: row.flow,
      installments: Number(row.installments) || 1, type: row.type, paid: Boolean(row.paid), paidMonths: row.paid_months || {} };
  }

  window.CashboardCloud = {
    enabled,
    getSession: () => session,
    signIn: (email, password) => authRequest('token?grant_type=password', { email, password }),
    signUp: (email, password) => authRequest('signup', { email, password }),
    signOut: async () => { try { if (session?.access_token) await request('/auth/v1/logout', { method: 'POST' }); } finally { saveSession(null); } },
    refreshSession: async () => { if (session?.access_token) await accessToken(); return session; },
    loadExpenses: async () => {
      const user = session?.user;
      const rows = await request('/rest/v1/expenses?select=id,description,amount,date,due_date,notes,kind,flow,installments,type,paid,paid_months&order=date.desc');
      return (rows || []).map(localExpense);
    },
    upsertExpenses: async items => {
      if (!items.length) return [];
      const userId = session?.user?.id;
      const rows = items.map(item => normalizeExpense(item, userId));
      const result = await request('/rest/v1/expenses?on_conflict=id', { method: 'POST', body: rows,
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' } });
      return (result || []).map(localExpense);
    },
    deleteExpense: async id => {
      await request(`/rest/v1/expenses?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
    },
    loadProfile: async () => {
      const userId = session?.user?.id;
      const rows = await request(`/rest/v1/profiles?select=user_id,name,budget&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
      return rows?.[0] ? { name: rows[0].name, email: session?.user?.email || '', budget: Number(rows[0].budget) || 0 } : null;
    },
    saveProfile: async profile => {
      const body = { user_id: session?.user?.id, name: profile.name || '', budget: Number(profile.budget) || 0, updated_at: new Date().toISOString() };
      await request('/rest/v1/profiles?on_conflict=user_id', { method: 'POST', body,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    }
  };
})();

