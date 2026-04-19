window.uiState = {
  users: new Map(),
  allUsers: []
};

window.ui = {
  createBubble: (msg, isMine) => {
    const wrapper = document.createElement("div");
    wrapper.className = `flex mb-3 message-animation ${isMine ? "justify-end" : "justify-start"}`;
    if (msg.id) {
      wrapper.dataset.messageId = msg.id;
    }

    const bubble = document.createElement("div");
    bubble.className = `max-w-[70%] rounded-2xl px-4 py-2 shadow-sm ${isMine
        ? "bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-br-none"
        : "bg-white text-gray-800 rounded-bl-none border border-gray-200"
      }`;

    if (!isMine) {
      const header = document.createElement("div");
      header.className = "flex items-center gap-2 mb-1";

      const avatar = document.createElement("div");
      avatar.className = "w-5 h-5 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[10px] font-bold";

      const avatarLetter = (msg.fromUser?.avatar) || (msg.from || msg.username || "?").charAt(0).toUpperCase();
      avatar.innerText = avatarLetter;
      header.appendChild(avatar);

      const name = document.createElement("div");
      name.className = "text-xs font-semibold text-blue-600";
      name.innerText = msg.from || msg.username;
      header.appendChild(name);

      if (msg.fromUser?.bio) {
        name.title = msg.fromUser.bio;
      }

      bubble.appendChild(header);
    }

    const text = document.createElement("div");
    text.className = "break-words text-sm";

    // Mostrar indicador de editado o mensaje eliminado
    if (msg.deleted) {
      text.innerHTML = `<em class="opacity-50">${escapeHtml(msg.text)}</em>`;
    } else if (msg.edited) {
      text.innerHTML = `${escapeHtml(msg.text)} <span class="text-xs opacity-70 ml-1" title="Editado">✏️</span>`;
    } else {
      text.innerText = msg.text;
    }

    bubble.appendChild(text);

    const time = document.createElement("div");
    time.className = `text-[10px] mt-1 ${isMine ? "text-blue-100" : "text-gray-400"} text-right flex items-center justify-end gap-1`;

    const date = msg.createdAt ? new Date(msg.createdAt) : new Date();
    time.appendChild(document.createTextNode(date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));

    // Añadir botones de acción solo para mensajes no eliminados del usuario actual
    if (isMine && !msg.deleted) {
      const actions = document.createElement("div");
      actions.className = "flex gap-1 ml-2";

      const editBtn = document.createElement("button");
      editBtn.className = "hover:opacity-70 transition";
      editBtn.innerHTML = '<i class="fas fa-pencil-alt text-xs"></i>';
      editBtn.title = "Editar mensaje";
      editBtn.onclick = (e) => {
        e.stopPropagation();
        window.ui.showEditModal(msg);
      };

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "hover:opacity-70 transition";
      deleteBtn.innerHTML = '<i class="fas fa-trash-alt text-xs"></i>';
      deleteBtn.title = "Borrar mensaje";
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        window.ui.confirmDelete(msg);
      };

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      time.appendChild(actions);
    }

    bubble.appendChild(time);
    wrapper.appendChild(bubble);
    return wrapper;
  },

  renderConversation: (chatId) => {
    const container = document.getElementById("chat-messages");
    if (!container) return;

    container.innerHTML = "";

    const messages = window.conversations[chatId] || [];
    const currentUser = localStorage.getItem("username");

    messages.forEach(msg => {
      const isMine = (msg.from === currentUser) || (msg.username === currentUser);
      container.appendChild(window.ui.createBubble(msg, isMine));
    });

    container.scrollTop = container.scrollHeight;
  },

  renderConversationList: () => {
    const list = document.getElementById("conversation-list");
    if (!list) return;

    list.innerHTML = "";
    const currentUser = localStorage.getItem("username");
    const unreadCounts = window.unreadCounts || {};

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
      const unreadCount = unreadCounts[chatId] || 0;

      const li = document.createElement("li");
      li.className = `conversation-item cursor-pointer transition-all duration-200 ${window.currentChat === chatId ? "bg-blue-50 border-l-4 border-blue-500" : "hover:bg-gray-50"
        }`;

      let lastMessageText = "";
      if (lastMessage) {
        if (lastMessage.deleted) {
          lastMessageText = "[Mensaje eliminado]";
        } else if (lastMessage.edited) {
          lastMessageText = `${lastMessage.text.substring(0, 50)} ✏️`;
        } else {
          lastMessageText = lastMessage.text.substring(0, 50);
        }
      }

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
              ${lastMessage ? `<span class="text-xs text-gray-400">${new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>` : ''}
            </div>
            ${lastMessage ? `<p class="text-sm text-gray-500 truncate">${escapeHtml(lastMessageText)}</p>` : '<p class="text-sm text-gray-400 italic">Sin mensajes</p>'}
          </div>
          ${unreadCount > 0 ? `
            <div class="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              ${unreadCount > 9 ? '9+' : unreadCount}
            </div>
          ` : ''}
        </div>
      `;

      li.addEventListener("click", () => window.chat?.selectConversation(chatId, displayName, isOnline, isGeneral, unreadCount));
      list.appendChild(li);
    });
  },

  highlightConversation: (chatId) => {
    document.querySelectorAll(".conversation-item").forEach(item => {
      item.classList.remove("bg-blue-50", "border-l-4", "border-blue-500");
    });
  },

  renderUsersList: () => {
    const list = document.getElementById("users-list");
    if (!list) return;

    list.innerHTML = "";
    const currentUser = localStorage.getItem("username");

    window.uiState.allUsers.forEach(u => {
      if (u.username === currentUser) return;

      const username = u.username;
      const userState = window.uiState.users.get(username) || { online: false };
      const isOnline = userState.online;

      const li = document.createElement("li");
      li.className = "flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100";

      li.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="relative">
            <div class="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow">
              <i class="fas fa-user text-white text-sm"></i>
            </div>
            ${isOnline ? '<span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white"></span>' : ""}
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

  addAlert: (alert) => {
    const list = document.getElementById("alerts");
    const li = document.createElement("li");
    li.className = "p-2 bg-yellow-50 border-l-4 border-yellow-400 rounded text-xs text-gray-800";
    li.innerHTML = `
      <div class="flex items-start space-x-2">
        <i class="fas fa-bell text-yellow-500 text-xs mt-0.5"></i>
        <div>
          <p class="font-semibold text-xs">${alert.type?.toUpperCase() || "INFO"}</p>
          <p class="text-gray-600">${escapeHtml(alert.text)}</p>
        </div>
      </div>
    `;
    list.prepend(li);
    if (alert.ephemeral) {
      setTimeout(() => li.remove(), 3000);
    }
    if (!alert.ephemeral && list.children.length > 10) {
      list.removeChild(list.lastChild);
    }
  },

  showTyping: (username) => {
    const el = document.getElementById("typing-indicator");
    if (el) el.innerText = `${username} está escribiendo…`;
  },

  hideTyping: () => {
    const el = document.getElementById("typing-indicator");
    if (el) el.innerText = "";
  },

  // ========== NUEVAS FUNCIONES PARA EDICIÓN Y BORRADO ==========

  showEditModal: (msg) => {
    let modal = document.getElementById("edit-modal");

    if (!modal) {
      window.ui.createEditModal();
      modal = document.getElementById("edit-modal");
    }

    const textarea = document.getElementById("edit-text");
    const saveBtn = document.getElementById("edit-save");
    const cancelBtn = document.getElementById("edit-cancel");

    textarea.value = msg.text;
    modal.classList.remove("hidden");
    modal.dataset.messageId = msg.id;
    modal.dataset.messageType = window.currentChat === "general" ? "global" : "private";

    // Remover event listeners anteriores para evitar duplicados
    const newSaveBtn = saveBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    newSaveBtn.addEventListener("click", () => {
      const newText = document.getElementById("edit-text").value.trim();
      if (!newText) return;

      window.ui.saveEditedMessage(msg.id, newText, modal.dataset.messageType);
      modal.classList.add("hidden");
    });

    newCancelBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
    });
  },

  createEditModal: () => {
    const modal = document.createElement("div");
    modal.id = "edit-modal";
    modal.className = "hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50";
    modal.innerHTML = `
      <div class="bg-white p-6 rounded-xl shadow-xl w-96">
        <h3 class="font-semibold mb-3">Editar mensaje</h3>
        <textarea id="edit-text" class="w-full border p-2 rounded mb-3" rows="3"></textarea>
        <div class="flex justify-end space-x-2">
          <button id="edit-cancel" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition">Cancelar</button>
          <button id="edit-save" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  },

  saveEditedMessage: async (messageId, newText, type) => {
    if (!messageId) {
      console.error("No messageId provided");
      window.ui.addAlert({ text: "Error: mensaje sin ID", ephemeral: true });
      return;
    }

    // Usar socket directamente en lugar de API REST
    if (window.chat?.socket) {
      if (type === "global") {
        window.chat.socket.emit("edit_message", { messageId, newText });
      } else {
        window.chat.socket.emit("edit_private_message", { messageId, newText });
      }
      window.ui.addAlert({ text: "Editando mensaje...", ephemeral: true });
    } else {
      window.ui.addAlert({ text: "Error: no hay conexión", ephemeral: true });
    }
  },

  updateMessageInUI: (messageId, updatedMessage) => {
    // Buscar y actualizar el mensaje en el DOM
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      const bubble = messageElement.querySelector('.max-w-\\[70\\%\\]');
      if (bubble) {
        const textDiv = bubble.querySelector('.break-words');
        if (textDiv) {
          if (updatedMessage.deleted) {
            textDiv.innerHTML = '<em class="opacity-50">[Mensaje eliminado]</em>';
            // Ocultar botones de acción
            const actions = messageElement.querySelector('.flex.gap-1');
            if (actions) actions.remove();
          } else if (updatedMessage.edited) {
            textDiv.innerHTML = `${escapeHtml(updatedMessage.text)} <span class="text-xs opacity-70 ml-1" title="Editado">✏️</span>`;
          } else {
            textDiv.innerText = updatedMessage.text;
          }
        }
      }
    }

    // Actualizar en el array de conversaciones
    for (const chatId in window.conversations) {
      const conversation = window.conversations[chatId];
      if (conversation) {
        const msgIndex = conversation.findIndex(m => m.id === messageId);
        if (msgIndex !== -1) {
          conversation[msgIndex] = { ...conversation[msgIndex], ...updatedMessage };
          break;
        }
      }
    }
  },

  confirmDelete: (msg) => {
    const confirmMsg = msg.edited
      ? `¿Eliminar este mensaje? (Se perderá el historial de ediciones)`
      : `¿Eliminar este mensaje?`;

    if (confirm(confirmMsg)) {
      window.ui.deleteMessage(msg.id, window.currentChat === "general" ? "global" : "private");
    }
  },

  deleteMessage: async (messageId, type) => {
    if (!messageId) {
      console.error("No messageId provided");
      window.ui.addAlert({ text: "Error: mensaje sin ID", ephemeral: true });
      return;
    }

    if (window.chat?.socket) {
      if (type === "global") {
        window.chat.socket.emit("delete_message", { messageId });
      } else {
        window.chat.socket.emit("delete_private_message", { messageId });
      }
      window.ui.addAlert({ text: "Eliminando mensaje...", ephemeral: true });
    } else {
      window.ui.addAlert({ text: "Error: no hay conexión", ephemeral: true });
    }
  },

  showMessageHistory: async (messageId, type) => {
    const token = localStorage.getItem("token");

    try {
      const result = await window.api.getMessageHistory(token, messageId, type);

      if (result.ok && result.data) {
        const history = result.data.editHistory;
        const currentText = result.data.currentText;

        let historyHtml = `<div class="p-4"><h3 class="font-bold mb-2">Historial de ediciones</h3>`;
        historyHtml += `<p class="text-sm text-gray-600 mb-3">Texto actual: "${escapeHtml(currentText)}"</p>`;

        if (history.length === 0) {
          historyHtml += `<p class="text-gray-500">No hay historial de ediciones</p>`;
        } else {
          historyHtml += `<div class="space-y-2 max-h-64 overflow-y-auto">`;
          history.slice().reverse().forEach((edit, index) => {
            historyHtml += `
              <div class="border-l-2 border-gray-300 pl-2 text-xs">
                <p class="text-gray-500">Versión anterior (${new Date(edit.editedAt).toLocaleString()}):</p>
                <p class="text-gray-700">"${escapeHtml(edit.text)}"</p>
              </div>
            `;
          });
          historyHtml += `</div>`;
        }

        historyHtml += `<div class="mt-4 flex justify-end"><button id="history-close" class="px-3 py-1 bg-gray-200 rounded">Cerrar</button></div></div>`;

        // Mostrar modal de historial
        let historyModal = document.getElementById("history-modal");
        if (!historyModal) {
          historyModal = document.createElement("div");
          historyModal.id = "history-modal";
          historyModal.className = "hidden fixed inset-0 bg-black/40 flex items-center justify-center z-50";
          document.body.appendChild(historyModal);
        }

        historyModal.innerHTML = historyHtml;
        historyModal.classList.remove("hidden");

        document.getElementById("history-close").addEventListener("click", () => {
          historyModal.classList.add("hidden");
        });
      }
    } catch (err) {
      console.error("Error obteniendo historial:", err);
      window.ui.addAlert({ text: "Error al obtener historial", ephemeral: true });
    }
  }
};

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}