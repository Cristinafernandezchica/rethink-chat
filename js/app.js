// Conversaciones por chat
window.conversations = {
  general: []
};
window.currentChat = "general";
window.currentRoom = null;
window.rooms = [];
window.currentRoomMessages = {};

let socket = null;

window.addEventListener("DOMContentLoaded", () => {
  const title = document.getElementById("auth-title");
  const btn = document.getElementById("auth-btn");
  const toggle = document.getElementById("toggle-auth");
  const errorBox = document.getElementById("auth-error");

  let mode = "login";

  toggle.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    title.innerText = mode === "login" ? "Iniciar sesión" : "Crear cuenta";
    btn.innerText = mode === "login" ? "Entrar" : "Registrarse";
    toggle.innerText = mode === "login"
      ? "¿No tienes cuenta? Regístrate"
      : "¿Ya tienes cuenta? Inicia sesión";
    errorBox.innerText = "";
  });

  btn.addEventListener("click", async () => {
    const username = document.getElementById("auth-username").value.trim();
    const password = document.getElementById("auth-password").value.trim();

    if (!username || !password) {
      errorBox.innerText = "Rellena todos los campos";
      return;
    }

    btn.disabled = true;
    btn.classList.add("opacity-60");
    errorBox.innerText = "";

    try {
      if (mode === "register") {
        const { ok, data } = await window.api.register(username, password);
        if (!ok) {
          errorBox.innerText = data.error || "Error al registrar";
        } else {
          errorBox.innerText = "Cuenta creada. Ahora inicia sesión.";
          mode = "login";
          title.innerText = "Iniciar sesión";
          btn.innerText = "Entrar";
        }
      } else {
        const { ok, data } = await window.api.login(username, password);
        if (!ok) {
          errorBox.innerText = data.error || "Error al iniciar sesión";
        } else {
          localStorage.setItem("token", data.token);
          localStorage.setItem("username", data.user.username);
          localStorage.setItem("role", data.user.role);

          document.getElementById("auth-screen").classList.add("hidden");
          document.getElementById("app-screen").classList.remove("hidden");
          document.getElementById("user-display").innerText = data.user.username;

          initSocket();
        }
      }
    } catch {
      errorBox.innerText = "Error de conexión con el servidor";
    } finally {
      btn.disabled = false;
      btn.classList.remove("opacity-60");
    }
  });

  document.getElementById("logout-btn").addEventListener("click", () => {
    localStorage.clear();
    if (socket) socket.disconnect();
    location.reload();
  });
});

// Asegurar que existe conversación
function ensureConversation(chatId) {
  if (!window.conversations[chatId]) {
    window.conversations[chatId] = [];
  }
}

function initSocket() {
  if (socket) {
    socket.disconnect();
  }
  
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");

  const getSocketUrl = () => {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
    return 'http://localhost:3000';
  };

socket = io(getSocketUrl());

  socket.on("connect", async () => {
    socket.emit("identify", token);

    // Mostrar panel admin si es admin
    if (localStorage.getItem("role") === "admin") {
      const adminPanel = document.getElementById("admin-panel");
      if (adminPanel) adminPanel.classList.remove("hidden");
    }

    // Cargar todos los usuarios (online y offline)
    try {
      const { ok, data } = await window.api.getAllUsers(token);
      if (ok) {
        const users = Array.isArray(data)
          ? data
          : Array.isArray(data.users)
          ? data.users
          : [];

        window.uiState.allUsers = users;

        users.forEach(u => {
          if (u.username === username) return;
          ensureConversation(u.username);
          if (!window.uiState.users.has(u.username)) {
            window.uiState.users.set(u.username, { online: false });
          }
        });

        window.ui.renderUsersList();
        window.ui.renderConversationList();
      }
    } catch (e) {
      console.error("Error cargando todos los usuarios:", e);
    }

    // Cargar contadores de mensajes no leídos
    try {
      const { ok, data } = await window.api.getUnreadCounts(token);
      if (ok && data.unreadCounts) {
        window.unreadCounts = data.unreadCounts;
        window.ui.renderConversationList();
      }
    } catch (e) {
      console.error("Error cargando contadores:", e);
    }

    // El historial privado llega por socket ("private_history") desde el evento
    // "identify". No se carga también por HTTP para evitar duplicados cuando
    // el changefeed entrega un mensaje nuevo antes de que termine la petición REST.
  });

  // Estado inicial online
  socket.on("online_users", (users) => {
    const currentUser = localStorage.getItem("username");

    // Marcar todos como offline
    window.uiState.allUsers.forEach(u => {
      if (u.username !== currentUser) {
        window.uiState.users.set(u.username, { online: false });
      }
    });

    // Marcar como online los que vienen en la lista
    users.forEach(u => {
      if (u.username !== currentUser) {
        window.uiState.users.set(u.username, { online: true });
      }
      ensureConversation(u.username);
    });

    window.ui.renderUsersList();
    window.ui.renderConversationList();
  });

  // Usuario entra
  socket.on("user_online", (user) => {
    const currentUser = localStorage.getItem("username");
    if (user.username === currentUser) return;

    if (!window.uiState.users.has(user.username)) {
      window.uiState.users.set(user.username, { online: true });
    } else {
      window.uiState.users.get(user.username).online = true;
    }
    ensureConversation(user.username);

    window.ui.renderUsersList();
    window.ui.renderConversationList();
  });

  // Usuario sale (queda como offline, no desaparece)
  socket.on("user_offline", (user) => {
    if (!window.uiState.users.has(user.username)) {
      window.uiState.users.set(user.username, { online: false });
    } else {
      window.uiState.users.get(user.username).online = false;
    }
    window.ui.renderUsersList();
    window.ui.renderConversationList();
  });

  // Historial general
  socket.on("chat_history", (messages) => {
    window.conversations.general = messages.map(m => ({
      from: m.username,
      to: "general",
      text: m.text,
      createdAt: m.createdAt
    }));
    if (window.currentChat === "general") {
      window.ui.renderConversation("general");
    }
  });

  // Mensaje general nuevo
  socket.on("new_message", (msg) => {
    window.conversations.general.push({
      from: msg.username,
      to: "general",
      text: msg.text,
      createdAt: msg.createdAt
    });
    if (window.currentChat === "general") {
      window.ui.renderConversation("general");
    }
  });

  // Historial privados vía socket
  // Usamos once() para que solo se procese en la conexión inicial.
  // En reconexiones posteriores el historial se fusiona por id para evitar duplicados.
  socket.on("private_history", (convs) => {
    convs.forEach(c => {
      ensureConversation(c.otherUser);

      // Construir un Set con los ids ya presentes (llegados por changefeed antes que el historial)
      const existingIds = new Set(
        window.conversations[c.otherUser]
          .filter(m => m.id)
          .map(m => m.id)
      );

      // Añadir solo los mensajes históricos que aún no están en el array
      const incoming = c.messages.map(msg => ({
        id: msg.id,
        from: msg.from,
        to: msg.to,
        text: msg.text,
        createdAt: msg.createdAt,
        read: msg.read
      }));

      // Sustituir el array por el historial completo + los mensajes nuevos que
      // llegaron por changefeed y que el historial aún no incluye (id desconocido)
      const historyIds = new Set(incoming.filter(m => m.id).map(m => m.id));
      const pendingNewMessages = window.conversations[c.otherUser].filter(
        m => m.id && !historyIds.has(m.id)
      );

      window.conversations[c.otherUser] = [...incoming, ...pendingNewMessages];

      if (!window.uiState.users.has(c.otherUser)) {
        window.uiState.users.set(c.otherUser, { online: false });
      }
    });

    window.ui.renderConversationList();
    if (window.currentChat !== "general" && window.conversations[window.currentChat]) {
      window.ui.renderConversation(window.currentChat);
    }
  });

  // Mensaje privado recibido - actualizar contadores
  socket.on("private_message", (msg) => {
    const currentUser = localStorage.getItem("username");
    const other = msg.from === currentUser ? msg.to : msg.from;

    ensureConversation(other);

    // Deduplicar siempre por id antes de hacer push
    const alreadyExists = msg.id && window.conversations[other].some(m => m.id === msg.id);
    if (alreadyExists) return;

    window.conversations[other].push(msg);

    if (!window.uiState.users.has(other)) {
      window.uiState.users.set(other, { online: false, hasUnread: false });
    }

    // Actualizar contador de no leídos si no es el usuario actual quien envía
    if (msg.to === currentUser && msg.read === false) {
      if (!window.unreadCounts) window.unreadCounts = {};
      window.unreadCounts[other] = (window.unreadCounts[other] || 0) + 1;
    }

    // Notificación si NO estás en ese chat
    if (window.currentChat !== other) {
      window.ui.addAlert({
        type: "message",
        text: `Nuevo mensaje de ${other}`,
        ephemeral: true
      });
      window.uiState.users.get(other).hasUnread = true;
    }

    window.ui.renderConversationList();

    if (window.currentChat === other) {
      window.uiState.users.get(other).hasUnread = false;
      window.ui.renderConversation(other);
    }
  });

  // Alertas
  socket.on("alert", window.ui.addAlert);

  // Enviar mensaje
  document.getElementById("chat-send").addEventListener("click", () => {
    const text = document.getElementById("chat-input").value.trim();
    if (!text) return;

    if (window.currentChat === "general") {
      socket.emit("send_message", { text, username });
    } else {
      const msg = {
        from: username,
        to: window.currentChat,
        text
      };

      socket.emit("private_message", msg);
    }

    document.getElementById("chat-input").value = "";
  });

  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("chat-send").click();
    }
  });

  // Typing estilo WhatsApp
  let typingTimeout = null;

  document.getElementById("chat-input").addEventListener("input", () => {
    if (window.currentChat === "general") return;

    socket.emit("typing", { to: window.currentChat });

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("stop_typing", { to: window.currentChat });
    }, 1500);
  });

  socket.on("typing", (data) => {
    if (window.currentChat === data.from) {
      window.ui.showTyping(data.from);
    }
  });

  socket.on("stop_typing", (data) => {
    if (window.currentChat === data.from) {
      window.ui.hideTyping();
    }
  });

  // Probar alerta simple
  document.getElementById("test-alert").addEventListener("click", () => {
    socket.emit("send_alert", {
      type: "info",
      text: "Esto es una alerta de prueba",
      ephemeral: true
    });
  });

  // Panel de administración: abrir modal para alerta global persistente
  const adminGlobalBtn = document.getElementById("admin-alert-global");
  const adminEfimeraBtn = document.getElementById("admin-alert-efimera");
  const alertModal = document.getElementById("alert-modal");
  const alertText = document.getElementById("alert-text");
  const alertCancel = document.getElementById("alert-cancel");
  const alertConfirm = document.getElementById("alert-confirm");

  if (adminGlobalBtn) {
    adminGlobalBtn.addEventListener("click", () => {
      alertModal.dataset.type = "global";
      alertModal.classList.remove("hidden");
    });
  }

  if (adminEfimeraBtn) {
    adminEfimeraBtn.addEventListener("click", () => {
      alertModal.dataset.type = "efimera";
      alertModal.classList.remove("hidden");
    });
  }

  if (alertCancel) {
    alertCancel.addEventListener("click", () => {
      alertModal.classList.add("hidden");
      alertText.value = "";
    });
  }

  if (alertConfirm) {
    alertConfirm.addEventListener("click", () => {
      const text = alertText.value.trim();
      const type = alertModal.dataset.type;

      if (!text) return;

      if (type === "global") {
        socket.emit("send_alert", { text, ephemeral: false });
      } else {
        socket.emit("send_alert", { text, ephemeral: true });
      }

      alertModal.classList.add("hidden");
      alertText.value = "";
    });
  }


  // BÚSQUEDA DE MENSAJES
  const searchInput = document.getElementById("search-input");
  const searchClear = document.getElementById("search-clear");
  const searchResults = document.getElementById("search-results");

  let searchTimeout = null;

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    const query = searchInput.value.trim();
    
    if (query.length < 2) {
      searchResults.classList.add("hidden");
      searchClear.classList.add("hidden");
      return;
    }
    
    searchClear.classList.remove("hidden");
    
    searchTimeout = setTimeout(async () => {
      const token = localStorage.getItem("token");
      const { ok, data } = await window.api.searchMessages(token, query);
      
      if (ok && data.results) {
        displaySearchResults(data.results, query);
      }
    }, 500);
  });

  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    searchResults.classList.add("hidden");
    searchClear.classList.add("hidden");
  });

  function displaySearchResults(results, query) {
    if (results.length === 0) {
      searchResults.innerHTML = `<p class="text-sm text-gray-500 p-2">No se encontraron resultados para "${escapeHtml(query)}"</p>`;
      searchResults.classList.remove("hidden");
      return;
    }
    
    let html = `<div class="text-xs text-gray-500 mb-2 p-1">Resultados para "${escapeHtml(query)}"</div>`;
    
    results.forEach(result => {
      if (result.chatType === "global") {
        // Mensaje global individual
        html += `
          <div class="search-result-item p-2 hover:bg-gray-100 rounded cursor-pointer mb-1" data-chat="general" data-message-id="${result.id}">
            <div class="flex justify-between items-start">
              <span class="text-xs font-semibold text-blue-600">${escapeHtml(result.username)}</span>
              <span class="text-xs text-gray-400">${new Date(result.createdAt).toLocaleTimeString()}</span>
            </div>
            <p class="text-sm text-gray-700">${highlightText(result.text, query)}</p>
            <span class="text-xs text-gray-400">📍 Chat General</span>
          </div>
        `;
      } else if (result.chatType === "private" && result.messages) {
        // Agrupar por conversación privada
        html += `
          <div class="search-result-conversation p-2 hover:bg-gray-100 rounded cursor-pointer mb-2" data-chat="${result.chatName}">
            <div class="flex items-center space-x-2 mb-1">
              <i class="fas fa-lock text-gray-400 text-xs"></i>
              <span class="text-sm font-semibold text-gray-700">${escapeHtml(result.chatName)}</span>
              <span class="text-xs text-gray-400">${result.messages.length} mensajes</span>
            </div>
            <div class="pl-4 space-y-1">
        `;
        result.messages.forEach(msg => {
          html += `
            <div class="text-xs text-gray-600">
              <span class="font-medium">${escapeHtml(msg.from)}:</span>
              <span>${highlightText(msg.text, query)}</span>
            </div>
          `;
        });
        html += `</div></div>`;
      }
    });
    
    searchResults.innerHTML = html;
    searchResults.classList.remove("hidden");
    
    // Añadir event listeners a los resultados
    document.querySelectorAll(".search-result-item").forEach(el => {
      el.addEventListener("click", () => {
        const chatId = el.dataset.chat;
        if (chatId) {
          window.currentChat = chatId;
          window.ui.renderConversation(chatId);
          searchResults.classList.add("hidden");
          searchInput.value = "";
        }
      });
    });
    
    document.querySelectorAll(".search-result-conversation").forEach(el => {
      el.addEventListener("click", () => {
        const chatId = el.dataset.chat;
        if (chatId) {
          window.currentChat = chatId;
          window.ui.renderConversation(chatId);
          searchResults.classList.add("hidden");
          searchInput.value = "";
        }
      });
    });
  }

  function highlightText(text, query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
    return text.replace(regex, `<mark class="bg-yellow-200">$1</mark>`);
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}