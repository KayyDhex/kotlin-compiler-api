# Imagen más simple - Node con Alpine
FROM node:18-alpine

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=8080

# Instalar Java y dependencias básicas
RUN apk add --no-cache openjdk11-jre wget

# Descargar Kotlin compiler
RUN wget -q https://github.com/JetBrains/kotlin/releases/download/v1.8.22/kotlin-compiler-1.8.22.zip \
    && unzip -q kotlin-compiler-1.8.22.zip -d /opt \
    && rm kotlin-compiler-1.8.22.zip

# Agregar Kotlin al PATH
ENV PATH="/opt/kotlinc/bin:${PATH}"

# Crear directorio de trabajo
WORKDIR /app

# Copiar solo el archivo principal (sin package.json)
COPY simple-kotlin-compiler.js .

# Exponer puerto
EXPOSE $PORT

# Comando de inicio simple
CMD ["node", "simple-kotlin-compiler.js"]