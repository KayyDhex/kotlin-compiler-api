# Imagen más simple - Node con Alpine
FROM node:18-alpine

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=8080

# Instalar bash, Java y dependencias básicas
RUN apk add --no-cache \
    bash \
    openjdk11-jre \
    wget \
    unzip

# Descargar Kotlin compiler (versión más pequeña)
RUN wget -q https://github.com/JetBrains/kotlin/releases/download/v1.8.22/kotlin-compiler-1.8.22.zip \
    && unzip -q kotlin-compiler-1.8.22.zip -d /opt \
    && rm kotlin-compiler-1.8.22.zip \
    && chmod +x /opt/kotlinc/bin/*

# Agregar Kotlin al PATH
ENV PATH="/opt/kotlinc/bin:${PATH}"

# Verificar instalación
RUN kotlinc -version && java -version

# Crear directorio de trabajo
WORKDIR /app

# Copiar solo el archivo principal
COPY simple-kotlin-compiler.js .

# Crear directorio temporal para compilaciones
RUN mkdir -p /tmp && chmod 777 /tmp

# Exponer puerto
EXPOSE $PORT

# Comando de inicio simple
CMD ["node", "simple-kotlin-compiler.js"]