window.stats = {
  modal: null,
  isLoading: false,
  refreshInterval: null,
  autoRefreshEnabled: true,

  init: function () {
    this.createStatsModal();

    // Añadir botón al panel de admin
    const adminPanel = document.getElementById("admin-panel");
    if (adminPanel && !document.getElementById("admin-stats-btn")) {
      const statsBtn = document.createElement("button");
      statsBtn.id = "admin-stats-btn";
      statsBtn.className = "w-full bg-purple-500 text-white py-2 rounded-lg hover:bg-purple-600 transition mt-2";
      statsBtn.innerHTML = '<i class="fas fa-chart-bar mr-2"></i>Estadísticas Avanzadas';
      statsBtn.onclick = () => this.showStats();
      adminPanel.appendChild(statsBtn);
    }
  },

  createStatsModal: function () {
    if (document.getElementById("stats-modal")) return;

    const modal = document.createElement("div");
    modal.id = "stats-modal";
    modal.className = "hidden fixed inset-0 bg-black/50 flex items-center justify-center z-50";
    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <div class="p-4 border-b bg-gradient-to-r from-purple-500 to-purple-600 text-white flex justify-between items-center">
          <div>
            <h2 class="text-xl font-bold"><i class="fas fa-chart-line mr-2"></i>Estadísticas del Chat</h2>
            <p class="text-xs opacity-90">Análisis mediante operaciones MapReduce en RethinkDB</p>
          </div>
          <div class="flex items-center space-x-3">
            <button id="refresh-stats" class="bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1 text-sm transition">
              <i class="fas fa-sync-alt mr-1"></i>Actualizar
            </button>
            <button id="close-stats-modal" class="text-white hover:text-gray-200 text-2xl">&times;</button>
          </div>
        </div>
        <div id="stats-content" class="flex-1 overflow-y-auto p-4">
          <div class="text-center py-8">
            <i class="fas fa-spinner fa-spin text-4xl text-purple-500"></i>
            <p class="mt-2 text-gray-500">Cargando estadísticas...</p>
          </div>
        </div>
        <div class="p-2 border-t bg-gray-50 text-center text-xs text-gray-400 flex justify-between items-center px-4">
          <span><i class="fas fa-database mr-1"></i>Datos procesados con MapReduce</span>
          <label class="flex items-center space-x-2 cursor-pointer">
            <span>Auto-actualizar</span>
            <input type="checkbox" id="auto-refresh-toggle" checked class="rounded">
          </label>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    document.getElementById("close-stats-modal").addEventListener("click", () => {
      this.hideStats();
    });

    document.getElementById("refresh-stats").addEventListener("click", () => {
      this.loadStats(true);
    });

    const autoToggle = document.getElementById("auto-refresh-toggle");
    if (autoToggle) {
      autoToggle.addEventListener("change", (e) => {
        this.autoRefreshEnabled = e.target.checked;
        if (this.autoRefreshEnabled) {
          this.startAutoRefresh();
        } else {
          this.stopAutoRefresh();
        }
      });
    }

    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.hideStats();
    });
  },

  startAutoRefresh: function () {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.refreshInterval = setInterval(() => {
      if (this.autoRefreshEnabled && !this.isLoading) {
        this.loadStats(true);
      }
    }, 30000); // Actualizar cada 30 segundos
  },

  stopAutoRefresh: function () {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  },

  showStats: async function () {
    const modal = document.getElementById("stats-modal");
    if (!modal) return;

    modal.classList.remove("hidden");
    await this.loadStats(false);
    this.startAutoRefresh();
  },

  hideStats: function () {
    const modal = document.getElementById("stats-modal");
    if (modal) modal.classList.add("hidden");
    this.stopAutoRefresh();
  },

  loadStats: async function (isRefresh = false) {
    const token = localStorage.getItem("token");
    const content = document.getElementById("stats-content");
    const refreshBtn = document.getElementById("refresh-stats");

    if (!content) return;

    if (!isRefresh) {
      this.isLoading = true;
    }

    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Cargando...';
    }

    try {
      // Cargar estadísticas principales
      const response = await fetch('/api/messages/stats/mapreduce', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();

      if (!result.success) {
        content.innerHTML = `<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-triangle text-4xl"></i><p>${result.error || "Error al cargar estadísticas"}</p></div>`;
        return;
      }

      // Cargar estadísticas en tiempo real
      const liveResponse = await fetch('/api/messages/stats/live', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const liveResult = await liveResponse.json();

      this.renderStats(result.stats, liveResult.realtime);

      if (isRefresh) {
        // Mostrar notificación de actualización
        const notification = document.createElement('div');
        notification.className = 'fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50 animate-fade-out';
        notification.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Estadísticas actualizadas';
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
      }

    } catch (err) {
      console.error("Error cargando estadísticas:", err);
      content.innerHTML = `<div class="text-center py-8 text-red-500"><i class="fas fa-exclamation-triangle text-4xl"></i><p>Error de conexión al cargar estadísticas</p></div>`;
    } finally {
      this.isLoading = false;
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i>Actualizar';
      }
    }
  },

  renderStats: function (stats, realtime) {
    const content = document.getElementById("stats-content");
    if (!content) return;

    const totalMessages = stats.globalMessages + stats.privateMessages;
    const globalPercent = Math.round((stats.globalMessages / totalMessages) * 100);
    const privatePercent = 100 - globalPercent;

    const html = `
      <!-- Indicador de actualización en vivo -->
      <div class="bg-green-50 rounded-lg p-2 mb-4 text-center text-xs text-green-600 border border-green-200">
        <i class="fas fa-chart-line mr-1"></i>Datos actualizados: ${new Date(stats.generatedAt).toLocaleTimeString()}
        ${this.autoRefreshEnabled ? '<span class="ml-2"><i class="fas fa-sync-alt fa-spin"></i> Auto-actualización activa</span>' : ''}
      </div>
      
      <!-- Panel de tiempo real (Live Stats) -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-green-50 rounded-lg p-4 border border-green-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-green-600 uppercase font-bold">Últimos 5 min</p>
              <p class="text-2xl font-bold text-green-700">${realtime.messagesLast5Min}</p>
              <p class="text-xs text-green-500">mensajes totales</p>
            </div>
            <i class="fas fa-clock text-3xl text-green-400"></i>
          </div>
          <div class="mt-2 text-xs">
            <span class="text-gray-500">Global: ${realtime.globalMessagesLast5Min}</span> | 
            <span class="text-gray-500">Privado: ${realtime.privateMessagesLast5Min}</span>
            <p class="text-gray-500">${realtime.messagesPerMinute} msg/minuto</p>
          </div>
        </div>
        
        <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-blue-600 uppercase font-bold">Usuarios activos</p>
              <p class="text-2xl font-bold text-blue-700">${realtime.activeUsersLast5Min}</p>
              <p class="text-xs text-blue-500">en los últimos 5 min</p>
            </div>
            <i class="fas fa-users text-3xl text-blue-400"></i>
          </div>
        </div>
        
        <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-purple-600 uppercase font-bold">Total mensajes</p>
              <p class="text-2xl font-bold text-purple-700">${totalMessages}</p>
              <p class="text-xs text-purple-500">globales + privados</p>
            </div>
            <i class="fas fa-comments text-3xl text-purple-400"></i>
          </div>
          <div class="mt-2 w-full bg-gray-200 rounded-full h-1.5">
            <div class="bg-purple-500 h-1.5 rounded-full" style="width: ${globalPercent}%"></div>
          </div>
          <div class="flex justify-between text-xs mt-1">
            <span>Global: ${stats.globalMessages}</span>
            <span>Privado: ${stats.privateMessages}</span>
          </div>
        </div>
        
        <div class="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-yellow-600 uppercase font-bold">Tendencias</p>
              <p class="text-xs text-gray-600 mt-1">Palabras en tendencia</p>
            </div>
            <i class="fas fa-fire text-3xl text-yellow-400"></i>
          </div>
          <div class="mt-2 flex flex-wrap gap-1">
            ${realtime.trendingWords.map(w => `
              <span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded">${escapeHtml(w.word)} (${w.count})</span>
            `).join('') || '<span class="text-xs text-gray-400">Sin datos</span>'}
          </div>
        </div>
      </div>
      
      <!-- Distribución de mensajes (Global vs Privado) -->
      <div class="bg-white rounded-lg border mb-6">
        <div class="bg-gray-50 p-3 border-b">
          <h3 class="font-bold text-gray-700"><i class="fas fa-chart-pie mr-2 text-purple-500"></i>Distribución de Mensajes</h3>
        </div>
        <div class="p-4">
          <div class="flex items-center space-x-4">
            <div class="flex-1">
              <div class="w-full bg-gray-200 rounded-full h-6">
                <div class="bg-blue-500 h-6 rounded-l-full flex items-center justify-center text-xs text-white font-bold" style="width: ${globalPercent}%">
                  ${globalPercent > 10 ? `Global ${globalPercent}%` : ''}
                </div>
              </div>
            </div>
            <div class="flex-1">
              <div class="w-full bg-gray-200 rounded-full h-6">
                <div class="bg-green-500 h-6 rounded-r-full flex items-center justify-center text-xs text-white font-bold" style="width: ${privatePercent}%">
                  ${privatePercent > 10 ? `Privado ${privatePercent}%` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Top palabras -->
      <div class="bg-white rounded-lg border mb-6">
        <div class="bg-gray-50 p-3 border-b">
          <h3 class="font-bold text-gray-700"><i class="fas fa-chart-simple mr-2 text-purple-500"></i>Top 15 Palabras Más Usadas</h3>
          <p class="text-xs text-gray-500">Operación MapReduce - Global + Privados</p>
        </div>
        <div class="p-4">
          <div class="flex flex-wrap gap-2">
            ${stats.topWords.map(word => `
              <div class="bg-blue-100 rounded-full px-3 py-1 text-sm">
                <span class="font-semibold">${escapeHtml(word.word)}</span>
                <span class="text-xs text-gray-500 ml-1">(${word.count})</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <!-- Usuarios más activos -->
      <div class="bg-white rounded-lg border mb-6">
        <div class="bg-gray-50 p-3 border-b">
          <h3 class="font-bold text-gray-700"><i class="fas fa-trophy mr-2 text-yellow-500"></i>Usuarios Más Activos</h3>
          <p class="text-xs text-gray-500">Basado en mensajes enviados (globales + privados)</p>
        </div>
        <div class="p-4">
          <div class="space-y-3">
            ${stats.topUsers.map((user, idx) => `
              <div>
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center space-x-2">
                    <span class="text-lg font-bold text-gray-400 w-6">${idx + 1}</span>
                    <span class="font-medium">${escapeHtml(user.username)}</span>
                  </div>
                  <div class="flex items-center space-x-2">
                    <span class="text-sm text-gray-500">Enviados: ${user.sentMessages}</span>
                    <span class="text-sm text-gray-500">Recibidos: ${user.receivedMessages}</span>
                    <span class="text-sm font-semibold text-blue-600">Total: ${user.totalActivity}</span>
                  </div>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div class="bg-blue-500 h-2 rounded-full" style="width: ${Math.min(100, (user.totalActivity / stats.topUsers[0].totalActivity) * 100)}%"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <!-- Actividad por hora del día -->
      <div class="bg-white rounded-lg border mb-6">
        <div class="bg-gray-50 p-3 border-b">
          <h3 class="font-bold text-gray-700"><i class="fas fa-chart-line mr-2 text-green-500"></i>Actividad por Hora del Día</h3>
        </div>
        <div class="p-4">
          <div class="flex items-end space-x-1 h-32">
            ${stats.activityByHour.map(hour => `
              <div class="flex-1 flex flex-col items-center">
                <div class="w-full bg-blue-400 rounded-t hover:bg-blue-500 transition cursor-pointer group relative" 
                     style="height: ${Math.max(5, (hour.count / stats.totalMessages) * 100)}px">
                  <div class="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1 py-0.5 hidden group-hover:block whitespace-nowrap">
                    ${hour.count} mensajes (${hour.percentage}%)
                  </div>
                </div>
                <span class="text-[10px] text-gray-500 mt-1">${hour.hourLabel}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <!-- Actividad por día de la semana -->
      <div class="bg-white rounded-lg border mb-6">
        <div class="bg-gray-50 p-3 border-b">
          <h3 class="font-bold text-gray-700"><i class="fas fa-calendar-week mr-2 text-indigo-500"></i>Actividad por Día de la Semana</h3>
        </div>
        <div class="p-4">
          <div class="flex items-end space-x-2 h-32">
            ${stats.activityByDay.map(day => `
              <div class="flex-1 flex flex-col items-center">
                <div class="w-full bg-indigo-400 rounded-t hover:bg-indigo-500 transition cursor-pointer group relative" 
                     style="height: ${Math.max(5, (day.count / stats.totalMessages) * 100)}px">
                  <div class="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1 py-0.5 hidden group-hover:block">
                    ${day.count} mensajes (${day.percentage}%)
                  </div>
                </div>
                <span class="text-[10px] text-gray-500 mt-1">${day.day.substring(0, 3)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <!-- Top conversaciones privadas -->
      <div class="bg-white rounded-lg border mb-6">
        <div class="bg-gray-50 p-3 border-b">
          <h3 class="font-bold text-gray-700"><i class="fas fa-lock mr-2 text-gray-500"></i>Conversaciones Privadas Más Activas</h3>
        </div>
        <div class="p-4">
          <div class="space-y-2">
            ${stats.privateStats.topConversations.map(conv => `
              <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                <div class="flex items-center space-x-2">
                  <i class="fas fa-comment-dots text-gray-400"></i>
                  <span class="font-medium">${escapeHtml(conv.user1)}</span>
                  <i class="fas fa-arrow-right text-gray-400 text-xs"></i>
                  <span class="font-medium">${escapeHtml(conv.user2)}</span>
                </div>
                <div class="flex items-center space-x-4">
                  <span class="text-sm text-gray-500">${conv.messageCount} mensajes</span>
                  <span class="text-xs text-gray-400">${new Date(conv.lastMessageAt).toLocaleDateString()}</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="mt-3 text-center text-xs text-gray-400">
            Total de conversaciones: ${stats.privateStats.totalConversations}
          </div>
        </div>
      </div>
      
      <!-- Análisis por usuario -->
      <div class="bg-white rounded-lg border">
        <div class="bg-gray-50 p-3 border-b">
          <h3 class="font-bold text-gray-700"><i class="fas fa-microphone mr-2 text-red-500"></i>Análisis por Usuario (Top 5)</h3>
          <p class="text-xs text-gray-500">Operación MapReduce por usuario - Palabras más frecuentes</p>
        </div>
        <div class="p-4">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${Object.entries(stats.userWordsStats).map(([username, data]) => `
              <div class="border rounded-lg p-3 hover:shadow-md transition">
                <h4 class="font-bold text-blue-600 mb-2">${escapeHtml(username)}</h4>
                <p class="text-xs text-gray-500 mb-2">${data.totalMessages} mensajes</p>
                <div class="flex flex-wrap gap-1">
                  ${data.topWords.map(word => `
                    <span class="bg-gray-100 rounded-full px-2 py-0.5 text-xs">
                      ${escapeHtml(word.word)} <span class="text-gray-400">(${word.count})</span>
                    </span>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      
      <div class="text-center text-xs text-gray-400 mt-4 pt-2 border-t">
        <i class="fas fa-database mr-1"></i>Estadísticas generadas con RethinkDB MapReduce | 
        Mensajes analizados: ${totalMessages} (${stats.globalMessages} globales + ${stats.privateMessages} privados)
      </div>
    `;

    content.innerHTML = html;
  }
};