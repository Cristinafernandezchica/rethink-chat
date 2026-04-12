// Chat Module
window.chat = {
  socket: null,
  
  initSocket: () => {
    if (window.chat.socket) {
      window.chat.socket.disconnect();
    }
    
    const token = localStorage.getItem("token");
    const username = localStorage.getItem("username");

    const getSocketUrl = () => {
      if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return window.location.origin;
      }
      return 'http://localhost:3000';
    };

    window.chat.socket = io(getSocketUrl());
    const socket = window.chat.socket;

    socket.on("connect", async () => {
      socket.emit("identify", token);

      if (localStorage.getItem("role") === "admin") {
        const adminPanel = document.getElementById("admin-panel");
        if (adminPanel) adminPanel.classList.remove("hidden");
      }

      await window.chat.loadUsers(token, username);
      await window.chat.loadUnreadCounts(token);

      // Update online count
      const updateOnlineCount = () => {
        const onlineUsers = Array.from(window.uiState.users.values()).filter(u => u.online).length;
        const countEl = document.getElementById("online-count");
        if (countEl) countEl.innerText = onlineUsers;
      };
      
      setInterval(updateOnlineCount, 1000);
    });

    // Socket event handlers
    socket.on("online_users", (users) => {
      const currentUser = localStorage.getItem("username");
      window.uiState.allUsers.forEach(u => {
        if (u.username !== currentUser) {
          window.uiState.users.set(u.username, { online: false });
        }
      });
      users.forEach(u => {
        if (u.username !== currentUser) {
          window.uiState.users.set(u.username, { online: true });
        }
        window.ensureConversation(u.username);
      });
      window.ui.renderUsersList();
      window.ui.renderConversationList();
    });

    socket.on("user_online", (user) => {
      const currentUser = localStorage.getItem("username");
      if (user.username === currentUser) return;
      if (!window.uiState.users.has(user.username)) {
        window.uiState.users.set(user.username, { online: true });
      } else {
        window.uiState.users.get(user.username).online = true;
      }
      window.ensureConversation(user.username);
      window.ui.renderUsersList();
      window.ui.renderConversationList();
    });

    socket.on("user_offline", (user) => {
      if (!window.uiState.users.has(user.username)) {
        window.uiState.users.set(user.username, { online: false });
      } else {
        window.uiState.users.get(user.username).online = false;
      }
      window.ui.renderUsersList();
      window.ui.renderConversationList();
    });

    socket.on("chat_history", (messages) => {
    window.conversations.general = messages.map(m => ({
        id: m.id,
        from: m.username,
        fromUser: {
        username: m.username,
        avatar: m.avatar || m.username.charAt(0).toUpperCase(),
        bio: m.bio || ""
        },
        to: "general",
        text: m.text,
        createdAt: m.createdAt,
        edited: m.edited || false,
        deleted: m.deleted || false,
        editHistory: m.editHistory || []
    }));
    if (window.currentChat === "general") {
        window.ui.renderConversation("general");
    }
    });

    socket.on("new_message", (msg) => {
    window.conversations.general.push({
        id: msg.id,
        from: msg.username,
        fromUser: {
        username: msg.username,
        avatar: msg.avatar || msg.username.charAt(0).toUpperCase(),
        bio: msg.bio || ""
        },
        to: "general",
        text: msg.text,
        createdAt: msg.createdAt,
        edited: msg.edited || false,
        deleted: msg.deleted || false,
        editHistory: msg.editHistory || []
    });
    if (window.currentChat === "general") {
        window.ui.renderConversation("general");
    }
    });

    socket.on("private_history", (convs) => {
      convs.forEach(c => {
        window.ensureConversation(c.otherUser);
        const existingIds = new Set(window.conversations[c.otherUser].filter(m => m.id).map(m => m.id));
        const incoming = c.messages.map(msg => ({
          id: msg.id,
          from: msg.from,
          to: msg.to,
          text: msg.text,
          createdAt: msg.createdAt,
          read: msg.read
        }));
        const historyIds = new Set(incoming.filter(m => m.id).map(m => m.id));
        const pendingNewMessages = window.conversations[c.otherUser].filter(m => m.id && !historyIds.has(m.id));
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

    socket.on("private_message", (msg) => {
      const currentUser = localStorage.getItem("username");
      const other = msg.from === currentUser ? msg.to : msg.from;
      window.ensureConversation(other);
      
      const alreadyExists = msg.id && window.conversations[other].some(m => m.id === msg.id);
      if (alreadyExists) return;
      
      window.conversations[other].push(msg);
      if (!window.uiState.users.has(other)) {
        window.uiState.users.set(other, { online: false, hasUnread: false });
      }
      
      if (msg.to === currentUser && msg.read === false) {
        if (!window.unreadCounts) window.unreadCounts = {};
        window.unreadCounts[other] = (window.unreadCounts[other] || 0) + 1;
      }
      
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

    socket.on("alert", window.ui.addAlert);
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

    window.chat.setupMessageHandlers(socket, username);

    socket.on("message_edited", (message) => {
        window.ui.updateMessageInUI(message.id, message);
    });

    socket.on("message_deleted", (message) => {
        window.ui.updateMessageInUI(message.id, message);
    });

    socket.on("private_message_edited", (message) => {
        window.ui.updateMessageInUI(message.id, message);
    });

    socket.on("private_message_deleted", (message) => {
        window.ui.updateMessageInUI(message.id, message);
    });
  },

  loadUsers: async (token, username) => {
    try {
      const { ok, data } = await window.api.getAllUsers(token);
      if (ok) {
        const users = Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : [];
        window.uiState.allUsers = users;
        users.forEach(u => {
          if (u.username === username) return;
          window.ensureConversation(u.username);
          if (!window.uiState.users.has(u.username)) {
            window.uiState.users.set(u.username, { online: false });
          }
        });
        window.ui.renderUsersList();
        window.ui.renderConversationList();
      }
    } catch (e) {
      console.error("Error cargando usuarios:", e);
    }
  },
  

  loadUnreadCounts: async (token) => {
    try {
      const { ok, data } = await window.api.getUnreadCounts(token);
      if (ok && data.unreadCounts) {
        window.unreadCounts = data.unreadCounts;
        window.ui.renderConversationList();
      }
    } catch (e) {
      console.error("Error cargando contadores:", e);
    }
  },

  setupMessageHandlers: (socket, username) => {
    const sendBtn = document.getElementById("chat-send");
    const input = document.getElementById("chat-input");
    
    if (sendBtn) {
      sendBtn.addEventListener("click", () => {
        const text = input.value.trim();
        if (!text) return;
        
        if (window.currentChat === "general") {
          socket.emit("send_message", { text, username });
        } else {
          socket.emit("private_message", { from: username, to: window.currentChat, text });
        }
        
        input.value = "";
      });
    }
    
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendBtn?.click();
        }
      });
      
      let typingTimeout = null;
      input.addEventListener("input", () => {
        if (window.currentChat === "general") return;
        socket.emit("typing", { to: window.currentChat });
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          socket.emit("stop_typing", { to: window.currentChat });
        }, 1500);
      });
    }
  },

  selectConversation: async (chatId, displayName, isOnline, isGeneral, unreadCount) => {
    window.currentChat = chatId;
    document.getElementById("chat-title").innerText = displayName;
    const statusText = isGeneral ? "Grupo público" : (isOnline ? "En línea" : "Desconectado");
    const statusColor = isOnline ? "text-green-500" : "text-gray-400";
    document.getElementById("chat-status").innerHTML = `<span class="${statusColor}">${statusText}</span>`;
    
    if (!isGeneral && unreadCount > 0) {
      const token = localStorage.getItem("token");
      await window.api.markMessagesAsRead(token, chatId);
      if (window.unreadCounts) delete window.unreadCounts[chatId];
      window.ui.renderConversationList();
    }
    
    window.ui.renderConversation(chatId);
    window.ui.highlightConversation(chatId);
  }
};