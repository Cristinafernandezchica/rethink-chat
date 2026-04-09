FROM node:18-alpine

WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache python3 make g++ bash

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Crear start.sh
RUN printf '#!/bin/sh\n\
echo "⏳ Esperando a RethinkDB..."\n\
sleep 10\n\
echo "🗄️ Inicializando base de datos..."\n\
node src/initDB.js\n\
echo "🚀 Iniciando servidor..."\n\
node src/server.js\n\
' > /app/start.sh && chmod +x /app/start.sh

# Crear script de entrada alternativo para Railway
RUN printf '#!/bin/sh\n\
if [ -f /app/start.sh ]; then\n\
    exec /app/start.sh\n\
else\n\
    echo "ERROR: start.sh no encontrado"\n\
    exit 1\n\
fi\n\
' > /app/entry.sh && chmod +x /app/entry.sh

EXPOSE 3000

CMD ["/app/entry.sh"]