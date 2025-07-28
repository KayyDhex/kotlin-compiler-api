# Usar imagen oficial de OpenJDK con Kotlin instalado manualmente
FROM openjdk:11-jre-slim

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=8080
ENV KOTLIN_VERSION=1.8.22

# Instalar dependencias
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Instalar Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Descargar e instalar Kotlin
RUN curl -L "https://github.com/JetBrains/kotlin/releases/download/v${KOTLIN_VERSION}/kotlin-compiler-${KOTLIN_VERSION}.zip" -o kotlin.zip \
    && unzip kotlin.zip \
    && mv kotlinc /opt/kotlinc \
    && rm kotlin.zip

# Agregar Kotlin al PATH
ENV PATH="/opt/kotlinc/bin:${PATH}"

# Verificar instalaciones
RUN java -version
RUN kotlinc -version
RUN node --version

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivo principal
COPY simple-kotlin-compiler.js .

# Crear directorio temporal con permisos
RUN mkdir -p /tmp && chmod 777 /tmp

# Exponer puerto
EXPOSE $PORT

# Comando de inicio
CMD ["node", "simple-kotlin-compiler.js"]