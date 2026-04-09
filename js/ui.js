window.uiState = {
  users: new Map(),
  allUsers: []
};

window.ui = {
  // Crear burbuja de mensaje estilo moderno
  createBubble: (msg, isMine) => {
    const wrapper = document.createElement("div");
    wrapper.className = `flex mb-3 message-animation ${isMine ? "justify-end" : "justify-start"}`;
    
    const bubble = document.createElement("div");
    bubble.className = `max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${
      isMine 
        ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-none" 
        : "bg-white text-gray-800 rounded-bl-none border border-gray-200"
    }`;
    
    if (!isMine) {
      const name = document.createElement("div");
      name.className = "text-xs font-semibold text-blue-600 mb-1";
      name.innerText = msg.from;
      bubble.appendChild(name);
    }
    
    const text = document.createElement("div");
    text.className = "break-words text-sm";
    text.innerText = msg.text;
    bubble.appendChild(text);
    
    const time = document.createElement("div");
    time.className = `text-[10px] mt-1 ${isMine ? "text-blue-100" : "text-gray-400"} text-right`;
    const date = msg.createdAt ? new Date(msg.createdAt) : new Date();
    time.innerText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(time);
    
    wrapper.appendChild(bubble);
    return wrapper;
  },

  // Render de una conversación
  renderConversation: (chatId) => {
    const container = document.getElementById("chat-messages");
    if (!container) return;
    
    container.innerHTML = "";
    
    const messages = window.conversations[chatId] || [];
    const currentUser = localStorage.getItem("username");
    
    messages.forEach(msg => {
      const isMine = msg.from === currentUser;
      container.appendChild(window.ui.createBubble(msg, isMine));
    });
    
    container.scrollTop = container.scrollHeight;
  },

  // Render lista de conversaciones
  renderConversationList: () => {
    const list = document.getElementById("conversation-list");
    if (!list) return;
    
    list.innerHTML = "";
    const currentUser = localStorage.getItem("username");
    
    // Ordenar conversaciones: primero las que tienen mensajes no leídos
    const sorted = Object.keys(window.conversations).sort((a, b) => {
      if (a === "general") return -1;
      if (b === "general") return 1;
      return 0;
    });
    
    sorted.forEach(chatId => {
      if (chatId === currentUser) return;
      
      const isGeneral = chatId === "general";
      const displayName = isGeneral ? "Chat general" : chatId;
      const userState = window.uiState.users.get(chatId);
      const isOnline = userState?.online || false;
      const lastMessage = window.conversations[chatId][window.conversations[chatId].length - 1];
      
      const li = document.createElement("li");
      li.className = `conversation-item cursor-pointer transition-all duration-200 ${
        window.currentChat === chatId ? "bg-blue-50 border-l-4 border-blue-500" : "hover:bg-gray-50"
      }`;
      
      li.innerHTML = `
        <div class="flex items-center p-3 space-x-3">
          <div class="relative">
            <div class="w-12 h-12 rounded-full bg-gradient-to-br ${isGeneral ? 'from-purple-400 to-purple-600' : 'from-blue-400 to-blue-600'} flex items-center justify-center shadow-md">
              <i class="fas ${isGeneral ? 'fa-users' : 'fa-user'} text-white text-lg"></i>
            </div>
            ${!isGeneral && isOnline ? '<div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white online-pulse"></div>' : ''}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex justify-between items-baseline">
              <p class="font-semibold text-gray-800 truncate">${escapeHtml(displayName)}</p>
              ${lastMessage ? `<span class="text-xs text-gray-400">${new Date(lastMessage.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>` : ''}
            </div>
            ${lastMessage ? `<p class="text-sm text-gray-500 truncate">${escapeHtml(lastMessage.text.substring(0, 50))}</p>` : '<p class="text-sm text-gray-400 italic">Sin mensajes</p>'}
          </div>
        </div>
      `;
      
      li.addEventListener("click", () => {
        window.currentChat = chatId;
        document.getElementById("chat-title").innerText = displayName;
        const statusText = isGeneral ? "Grupo público" : (isOnline ? "En línea" : "Desconectado");
        const statusColor = isOnline ? "text-green-500" : "text-gray-400";
        document.getElementById("chat-status").innerHTML = `<span class="${statusColor}">${statusText}</span>`;
        window.ui.renderConversation(chatId);
        window.ui.highlightConversation(chatId);
      });
      
      list.appendChild(li);
    });
  },
  
  highlightConversation: (chatId) => {
    document.querySelectorAll(".conversation-item").forEach(item => {
      item.classList.remove("bg-blue-50", "border-l-4", "border-blue-500");
    });
  },

  // Render lista de todos los usuarios
  renderUsersList: () => {
    const list = document.getElementById("users-list");
    list.innerHTML = "";

    const currentUser = localStorage.getItem("username");

    // window.uiState.allUsers viene de getAllUsers en app.js
    window.uiState.allUsers.forEach(u => {
      if (u.username === currentUser) return;

      const username = u.username;
      const userState = window.uiState.users.get(username) || { online: false, hasUnread: false };
      const isOnline = userState.online;

      const li = document.createElement("li");
      li.className =
        "flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100";

      li.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="relative">
            <div class="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow">
              <i class="fas fa-user text-white text-sm"></i>
            </div>
            ${
              isOnline
                ? '<span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>'
                : ""
            }
          </div>
          <div>
            <p class="text-sm font-medium text-gray-800">${escapeHtml(username)}</p>
            <p class="text-xs ${isOnline ? "text-green-600" : "text-gray-400"}">
              ${isOnline ? "En línea" : "Desconectado"}
            </p>
          </div>
        </div>
      `;

      li.addEventListener("click", () => {
        window.currentChat = username;
        window.ui.renderConversation(username);
        window.ui.renderConversationList();
      });

      list.appendChild(li);
    });
  },

  // Alertas
  addAlert: (alert) => {
    const list = document.getElementById("alerts");
    const li = document.createElement("li");

    li.className = "p-2 bg-yellow-50 border-l-4 border-yellow-400 rounded text-xs text-gray-800";

    li.innerHTML = `
      <div class="flex items-start space-x-2">
        <i class="fas fa-bell text-yellow-500 text-xs mt-0.5"></i>
        <div>
          <p class="font-semibold text-xs">${alert.type.toUpperCase()}</p>
          <p class="text-gray-600">${escapeHtml(alert.text)}</p>
        </div>
      </div>
    `;

    list.prepend(li);

    // EFÍMERAS: desaparecer a los 3 segundos
    if (alert.ephemeral) {
      setTimeout(() => li.remove(), 3000);
    }

    // Mantener máximo 10 alertas persistentes
    if (!alert.ephemeral && list.children.length > 10) {
      list.removeChild(list.lastChild);
    }
  },

  showTyping: (username) => {
    const el = document.getElementById("typing-indicator");
    el.innerText = `${username} está escribiendo…`;
  },

  hideTyping: () => {
    const el = document.getElementById("typing-indicator");
    el.innerText = "";
  }


};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}