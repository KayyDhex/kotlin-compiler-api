# Usar imagen base más ligera
FROM node:18-alpine

# Variables de entorno para optimizar memoria
ENV NODE_ENV=production
ENV PORT=8080
ENV JAVA_OPTS="-Xmx128m -Xms64m"

# Instalar Java y Kotlin de forma más eficiente
RUN apk add --no-cache \
    openjdk11-jre \
    wget \
    unzip \
    && wget -q https://github.com/JetBrains/kotlin/releases/download/v1.8.22/kotlin-compiler-1.8.22.zip \
    && unzip -q kotlin-compiler-1.8.22.zip \
    && mv kotlinc /opt/kotlinc \
    && rm kotlin-compiler-1.8.22.zip \
    && apk del wget unzip

# Agregar Kotlin al PATH
ENV PATH="/opt/kotlinc/bin:${PATH}"

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos
COPY package.json .
COPY simple-kotlin-compiler.js .

# Instalar dependencias de Node
RUN npm ci --only=production && npm cache clean --force

# Usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
USER nextjs

# Exponer puerto
EXPOSE $PORT

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:$PORT/health || exit 1

# Comando de inicio con límites de memoria
CMD ["node", "--max-old-space-size=256", "simple-kotlin-compiler.js"]