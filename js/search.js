window.search = {
  currentSubscription: null,
  currentQuery: "",
  resultsVisible: true,

  init: function () {
    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    const searchResults = document.getElementById("search-results");
    let searchTimeout = null;
    const self = this;

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        self.currentQuery = query;

        if (query.length < 2) {
          searchResults.classList.add("hidden");
          searchClear.classList.add("hidden");
          self.resultsVisible = false;
          // Cancelar suscripción anterior
          if (window.chat?.socket && self.currentSubscription) {
            window.chat.socket.off("search_results", self.handleResults.bind(self));
            self.currentSubscription = false;
          }
          return;
        }

        searchClear.classList.remove("hidden");
        self.resultsVisible = true;

        searchTimeout = setTimeout(function () {
          self.performSearch(query);
        }, 500);
      });
    }

    if (searchClear) {
      searchClear.addEventListener("click", function () {
        searchInput.value = "";
        searchResults.classList.add("hidden");
        searchClear.classList.add("hidden");
        self.resultsVisible = false;
        // Cancelar suscripción
        if (window.chat?.socket && self.currentSubscription) {
          window.chat.socket.off("search_results", self.handleResults.bind(self));
          self.currentSubscription = false;
          window.chat.socket.emit("subscribe_search", "");
        }
        self.currentQuery = "";
      });
    }
  },

  performSearch: function (query) {
    if (!window.chat?.socket) {
      console.error("Socket no disponible");
      return;
    }

    if (!this.currentSubscription) {
      window.chat.socket.on("search_results", this.handleResults.bind(this));
      this.currentSubscription = true;
    }

    console.log("Buscando:", query);
    window.chat.socket.emit("subscribe_search", query);
  },

  handleResults: function (data) {
    // Solo mostrar resultados si la consulta actual coincide
    if (data.searchTerm !== this.currentQuery) {
      return;
    }

    console.log("Resultados recibidos:", data.results.length);
    this.displayResults(data.results, data.searchTerm);
  },

  displayResults: function (results, query) {
    const searchResults = document.getElementById("search-results");
    if (!searchResults) return;

    if (!this.resultsVisible) return;

    if (results.length === 0) {
      searchResults.innerHTML = `<p class="text-sm text-gray-500 p-2">🔍 No se encontraron resultados para "${escapeHtml(query)}"</p>`;
      searchResults.classList.remove("hidden");
      return;
    }

    let html = `<div class="text-xs text-gray-500 mb-2 p-1 border-b flex justify-between items-center">
                  <span>✨ Resultados en tiempo real para "${escapeHtml(query)}"</span>
                  <button id="close-search-results" class="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded hover:bg-gray-100">
                    <i class="fas fa-times"></i> Cerrar
                  </button>
                </div>`;

    results.forEach(result => {
      if (result.chatType === "global") {
        html += `
          <div class="search-result-item p-2 hover:bg-blue-50 rounded cursor-pointer mb-1 transition" 
               data-chat="general" 
               data-message-id="${result.id}"
               data-message-type="global">
            <div class="flex justify-between items-start">
              <span class="text-xs font-semibold text-blue-600">💬 ${escapeHtml(result.username)}</span>
              <span class="text-xs text-gray-400">${new Date(result.createdAt).toLocaleTimeString()}</span>
            </div>
            <p class="text-sm text-gray-700 mt-1">${window.search.highlightText(result.text, query)}</p>
            <span class="text-xs text-gray-400">📍 Chat General</span>
          </div>
        `;
      } else if (result.chatType === "private" && result.messages) {
        html += `
          <div class="search-result-conversation mb-2 border-l-2 border-blue-200" data-chat="${result.chatName}">
            <div class="p-2 bg-gray-50 rounded-t">
              <div class="flex items-center space-x-2">
                <i class="fas fa-lock text-gray-400 text-xs"></i>
                <span class="text-sm font-semibold text-gray-700">🔒 Conversación con ${escapeHtml(result.chatName)}</span>
                <span class="text-xs text-gray-400">${result.messages.length} mensajes</span>
              </div>
            </div>
            <div class="pl-4 space-y-1 bg-white rounded-b">
        `;
        result.messages.forEach(msg => {
          html += `
            <div class="search-result-message text-xs text-gray-600 hover:bg-blue-50 p-1 rounded cursor-pointer transition"
                 data-chat="${result.chatName}"
                 data-message-id="${msg.id}"
                 data-message-type="private">
              <span class="font-medium text-blue-500">${escapeHtml(msg.from)}:</span>
              <span>${window.search.highlightText(msg.text, query)}</span>
              <span class="text-gray-400 text-[10px] ml-1">${new Date(msg.createdAt).toLocaleTimeString()}</span>
            </div>
          `;
        });
        html += `</div></div>`;
      }
    });

    // Añadir indicador de "en vivo"
    html += `<div class="text-center text-[10px] text-green-500 mt-2 pb-1">Actualizaciones en tiempo real activas</div>`;

    searchResults.innerHTML = html;
    searchResults.classList.remove("hidden");

    // Event listener para cerrar resultados
    const closeBtn = document.getElementById("close-search-results");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        searchResults.classList.add("hidden");
        this.resultsVisible = false;
      });
    }

    // Añadir event listeners a los resultados de mensajes individuales
    const self = this;
    document.querySelectorAll(".search-result-item, .search-result-message").forEach(function (el) {
      el.addEventListener("click", async function (e) {
        e.stopPropagation();
        const chatId = this.dataset.chat;
        const messageId = this.dataset.messageId;
        const messageType = this.dataset.messageType;

        if (chatId && messageId) {
          // Cambiar al chat correspondiente
          const isGeneral = chatId === "general";
          const displayName = isGeneral ? "Chat general" : chatId;

          // Seleccionar la conversación
          if (window.chat?.selectConversation) {
            await window.chat.selectConversation(chatId, displayName, false, isGeneral, 0);
          }

          // Esperar un momento para que se rendericen los mensajes
          setTimeout(() => {
            self.scrollToMessage(messageId, messageType);
          }, 300);
        }
      });
    });

    // Event listeners para las cabeceras de conversación (expanden/colapsan)
    document.querySelectorAll(".search-result-conversation").forEach(function (el) {
      const header = el.querySelector('.bg-gray-50');
      const messagesContainer = el.querySelector('.pl-4');

      if (header && messagesContainer) {
        header.style.cursor = 'pointer';
        header.addEventListener('click', function (e) {
          e.stopPropagation();
          const isHidden = messagesContainer.style.display === 'none';
          messagesContainer.style.display = isHidden ? 'block' : 'none';
        });
      }
    });
  },

  scrollToMessage: function (messageId, messageType) {
    // Buscar el elemento del mensaje en el DOM
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);

    if (messageElement) {
      // Scroll suave hasta el mensaje
      messageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });

      // Añadir un efecto de resaltado temporal
      const bubble = messageElement.querySelector('.max-w-\\[70\\%\\]');
      if (bubble) {
        bubble.classList.add('ring-2', 'ring-yellow-400', 'ring-offset-2', 'transition-all', 'duration-300');

        // Quitar el resaltado después de 3 segundos
        setTimeout(() => {
          bubble.classList.remove('ring-2', 'ring-yellow-400', 'ring-offset-2');
        }, 3000);
      }
    } else {
      // Si el mensaje no está en el DOM (quizás no cargado), recargar la conversación
      console.log("Mensaje no encontrado en el DOM, recargando conversación...");

      // Forzar recarga de la conversación actual
      const currentChat = window.currentChat;
      if (currentChat && window.ui?.renderConversation) {
        window.ui.renderConversation(currentChat);

        // Intentar de nuevo después de la recarga
        setTimeout(() => {
          const retryElement = document.querySelector(`[data-message-id="${messageId}"]`);
          if (retryElement) {
            retryElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const retryBubble = retryElement.querySelector('.max-w-\\[70\\%\\]');
            if (retryBubble) {
              retryBubble.classList.add('ring-2', 'ring-yellow-400', 'ring-offset-2');
              setTimeout(() => {
                retryBubble.classList.remove('ring-2', 'ring-yellow-400', 'ring-offset-2');
              }, 3000);
            }
          }
        }, 500);
      }
    }
  },

  highlightText: function (text, query) {
    if (!query || !text) return escapeHtml(text);
    const regex = new RegExp(`(${window.search.escapeRegex(query)})`, "gi");
    return escapeHtml(text).replace(regex, `<mark class="bg-yellow-200 text-gray-900 px-0.5 rounded">$1</mark>`);
  },

  escapeRegex: function (string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  },

  // Función para ocultar resultados manualmente
  hideResults: function () {
    const searchResults = document.getElementById("search-results");
    if (searchResults) {
      searchResults.classList.add("hidden");
      this.resultsVisible = false;
    }
  },

  // Función para mostrar resultados nuevamente
  showResults: function () {
    if (this.currentQuery && this.currentQuery.length >= 2) {
      this.resultsVisible = true;
      this.performSearch(this.currentQuery);
    }
  }
};