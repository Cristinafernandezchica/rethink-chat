// Search Module
window.search = {
  init: () => {
    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    const searchResults = document.getElementById("search-results");
    let searchTimeout = null;

    if (searchInput) {
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
            window.search.displayResults(data.results, query);
          }
        }, 500);
      });
    }

    if (searchClear) {
      searchClear.addEventListener("click", () => {
        searchInput.value = "";
        searchResults.classList.add("hidden");
        searchClear.classList.add("hidden");
      });
    }
  },

  displayResults: (results, query) => {
    const searchResults = document.getElementById("search-results");
    if (!searchResults) return;
    
    if (results.length === 0) {
      searchResults.innerHTML = `<p class="text-sm text-gray-500 p-2">No se encontraron resultados para "${escapeHtml(query)}"</p>`;
      searchResults.classList.remove("hidden");
      return;
    }
    
    let html = `<div class="text-xs text-gray-500 mb-2 p-1">Resultados para "${escapeHtml(query)}"</div>`;
    
    results.forEach(result => {
      if (result.chatType === "global") {
        html += `
          <div class="search-result-item p-2 hover:bg-gray-100 rounded cursor-pointer mb-1" data-chat="general" data-message-id="${result.id}">
            <div class="flex justify-between items-start">
              <span class="text-xs font-semibold text-blue-600">${escapeHtml(result.username)}</span>
              <span class="text-xs text-gray-400">${new Date(result.createdAt).toLocaleTimeString()}</span>
            </div>
            <p class="text-sm text-gray-700">${window.search.highlightText(result.text, query)}</p>
            <span class="text-xs text-gray-400">📍 Chat General</span>
          </div>
        `;
      } else if (result.chatType === "private" && result.messages) {
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
              <span>${window.search.highlightText(msg.text, query)}</span>
            </div>
          `;
        });
        html += `</div></div>`;
      }
    });
    
    searchResults.innerHTML = html;
    searchResults.classList.remove("hidden");
    
    document.querySelectorAll(".search-result-item, .search-result-conversation").forEach(el => {
      el.addEventListener("click", () => {
        const chatId = el.dataset.chat;
        if (chatId) {
          window.currentChat = chatId;
          window.ui.renderConversation(chatId);
          searchResults.classList.add("hidden");
          document.getElementById("search-input").value = "";
        }
      });
    });
  },

  highlightText: (text, query) => {
    const regex = new RegExp(`(${window.search.escapeRegex(query)})`, "gi");
    return text.replace(regex, `<mark class="bg-yellow-200">$1</mark>`);
  },

  escapeRegex: (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
};