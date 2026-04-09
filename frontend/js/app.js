// Conversaciones por chat
window.conversations = {
  general: []
};
window.currentChat = "general";

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

  socket = io("http://localhost:3000");

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

    // Cargar histórico de privados
    try {
      const { ok, data } = await window.api.getPrivateHistory(token);
      if (ok && Array.isArray(data)) {
        data.forEach(c => {
          ensureConversation(c.otherUser);
          window.conversations[c.otherUser] = c.messages.map(msg => ({
            from: msg.from,
            to: msg.to,
            text: msg.text,
            createdAt: msg.createdAt
          }));
          if (!window.uiState.users.has(c.otherUser)) {
            window.uiState.users.set(c.otherUser, { online: false });
          }
        });
        window.ui.renderConversationList();
      }
    } catch (e) {
      console.error("Error cargando histórico privado:", e);
    }
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
  socket.on("private_history", (convs) => {
    console.log("Recibido historial privado vía socket:", convs.length);

    convs.forEach(c => {
      ensureConversation(c.otherUser);
      window.conversations[c.otherUser] = c.messages.map(msg => ({
        from: msg.from,
        to: msg.to,
        text: msg.text,
        createdAt: msg.createdAt
      }));
      if (!window.uiState.users.has(c.otherUser)) {
        window.uiState.users.set(c.otherUser, { online: false });
      }
    });

    window.ui.renderConversationList();
    if (window.currentChat !== "general" && window.conversations[window.currentChat]) {
      window.ui.renderConversation(window.currentChat);
    }
  });

  // Mensaje privado recibido
  socket.on("private_message", (msg) => {
    const currentUser = localStorage.getItem("username");
    const other = msg.from === currentUser ? msg.to : msg.from;

    ensureConversation(other);
    window.conversations[other].push(msg);

    if (!window.uiState.users.has(other)) {
      window.uiState.users.set(other, { online: false, hasUnread: false });
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
}
