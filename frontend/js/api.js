const API_URL = "http://localhost:3000/api";

window.api = {
  login: async (username, password) => {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    return { ok: res.ok, data };
  },

  register: async (username, password) => {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    return { ok: res.ok, data };
  },

  getPrivateHistory: async (token) => {
    const res = await fetch(`${API_URL}/messages/private/history`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const data = await res.json();
    return { ok: res.ok, data };
  },
  
  getAllUsers: async (token) => {
    const res = await fetch(`${API_URL}/messages/users`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const data = await res.json();
    return { ok: res.ok, data };
  }
};