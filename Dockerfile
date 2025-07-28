# Usar imagen que ya tiene Kotlin instalado
FROM zenika/kotlin:1.8-jdk11-alpine

# Instalar Node.js
RUN apk add --no-cache nodejs npm

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=8080

# Verificar que Kotlin funciona
RUN kotlinc -version

# Crear directorio de trabajo
WORKDIR /app

# Copiar solo el archivo principal
COPY simple-kotlin-compiler.js .

# Crear directorio temporal para compilaciones
RUN mkdir -p /tmp && chmod 777 /tmp

# Exponer puerto
EXPOSE $PORT

# Comando de inicio
CMD ["node", "simple-kotlin-compiler.js"]