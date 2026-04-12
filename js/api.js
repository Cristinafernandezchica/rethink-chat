const getApiUrl = () => {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return window.location.origin + '/api';
  }
  return 'http://localhost:3000/api';
};

const API_URL = getApiUrl();

console.log('API_URL:', API_URL); // Para debug

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
  },

  searchMessages: async (token, query, type = "all") => {
    const res = await fetch(`${API_URL}/messages/search?q=${encodeURIComponent(query)}&type=${type}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const data = await res.json();
    return { ok: res.ok, data };
  },

  markMessagesAsRead: async (token, otherUser) => {
    const res = await fetch(`${API_URL}/messages/mark-read`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ otherUser })
    });
    const data = await res.json();
    return { ok: res.ok, data };
  },

  getUnreadCounts: async (token) => {
    const res = await fetch(`${API_URL}/messages/unread-counts`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    const data = await res.json();
    return { ok: res.ok, data };
  }
};