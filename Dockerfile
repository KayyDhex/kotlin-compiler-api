# Usar imagen base más simple y compatible con Railway
FROM openjdk:11-jre-slim

# Variables de entorno
ENV DEBIAN_FRONTEND=noninteractive
ENV PORT=8080

# Instalar dependencias básicas
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Instalar Kotlin compiler
RUN wget -q https://github.com/JetBrains/kotlin/releases/download/v1.9.10/kotlin-compiler-1.9.10.zip \
    && unzip kotlin-compiler-1.9.10.zip \
    && mv kotlinc /opt/kotlinc \
    && rm kotlin-compiler-1.9.10.zip

# Agregar Kotlin al PATH
ENV PATH="/opt/kotlinc/bin:${PATH}"

# Crear directorio de trabajo
WORKDIR /app

# Copiar nuestro compilador simple
COPY simple-kotlin-compiler.js .
COPY package.json .

# Instalar Node.js y dependencias
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install

# Exponer puerto
EXPOSE $PORT

# Comando de inicio
CMD ["node", "simple-kotlin-compiler.js"]