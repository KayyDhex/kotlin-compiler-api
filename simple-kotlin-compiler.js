// ¡SIN DEPENDENCIAS EXTERNAS! Solo Node.js built-in
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 8080;

// Servidor HTTP simple sin Express
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;

  try {
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200);
      res.end(JSON.stringify({
        message: 'Kotlin Compiler API - Solo para estudiantes',
        status: 'running',
        supported_language: 'Kotlin (language_id: 78)',
        version: '1.0.0'
      }));
    }
    else if (req.method === 'GET' && path === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'healthy' }));
    }
    else if (req.method === 'GET' && path === '/languages') {
      res.writeHead(200);
      res.end(JSON.stringify([{
        id: 78,
        name: 'Kotlin',
        is_archived: false,
        source_file: 'Main.kt',
        compile_cmd: 'kotlinc Main.kt -include-runtime -d program.jar',
        run_cmd: 'java -jar program.jar'
      }]));
    }
    else if (req.method === 'POST' && path === '/submissions') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const result = await handleSubmission(data);
          res.writeHead(200);
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON or request' }));
        }
      });
    }
    else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// Función para manejar submissions
async function handleSubmission(data) {
  const { source_code, language_id, stdin = '' } = data;
  
  if (!source_code) {
    throw new Error('source_code es requerido');
  }
  
  if (language_id && language_id !== 78) {
    throw new Error('Solo se permite Kotlin (language_id: 78)');
  }
  
  if (source_code.length > 50000) {
    throw new Error('Código fuente demasiado largo');
  }
  
  const result = await compileAndRunKotlin(source_code, stdin);
  
  return {
    token: crypto.randomUUID(),
    status: {
      id: result.success ? 3 : (result.status === 'Compilation Error' ? 6 : 5),
      description: result.status
    },
    stdout: result.output,
    stderr: result.error,
    compile_output: result.error,
    time: result.time,
    memory: result.memory,
    created_at: new Date().toISOString(),
    finished_at: new Date().toISOString()
  };
}

// Función para compilar y ejecutar Kotlin
async function compileAndRunKotlin(sourceCode, stdin = '') {
  const sessionId = crypto.randomUUID();
  const tempDir = `/tmp/kotlin_${sessionId}`;
  const sourceFile = path.join(tempDir, 'Main.kt');
  const jarFile = path.join(tempDir, 'program.jar');
  
  try {
    // Crear directorio temporal
    await fs.mkdir(tempDir, { recursive: true });
    
    // Escribir código fuente
    await fs.writeFile(sourceFile, sourceCode, 'utf8');
    
    // Compilar
    const compileResult = await executeCommand(
      `kotlinc "${sourceFile}" -include-runtime -d "${jarFile}"`,
      tempDir,
      10000 // 10 segundos timeout
    );
    
    if (compileResult.error && compileResult.code !== 0) {
      return {
        success: false,
        output: '',
        error: compileResult.stderr || compileResult.stdout || 'Error de compilación',
        status: 'Compilation Error',
        time: compileResult.time,
        memory: null
      };
    }
    
    // Ejecutar
    const runResult = await executeCommand(
      `java -jar "${jarFile}"`,
      tempDir,
      15000, // 15 segundos timeout
      stdin
    );
    
    return {
      success: runResult.code === 0,
      output: runResult.stdout || '',
      error: runResult.stderr || '',
      status: runResult.code === 0 ? 'Accepted' : 'Runtime Error',
      time: runResult.time,
      memory: null
    };
    
  } catch (error) {
    return {
      success: false,
      output: '',
      error: `Error interno: ${error.message}`,
      status: 'Internal Error',
      time: null,
      memory: null
    };
  } finally {
    // Limpiar archivos temporales
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.error('Error cleaning up:', cleanupError);
    }
  }
}

// Función para ejecutar comandos con timeout
function executeCommand(command, cwd, timeout = 10000, stdin = '') {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    const child = exec(command, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024, // 1MB buffer
      env: { ...process.env, JAVA_OPTS: '-Xmx64m' } // Limitar memoria JVM
    }, (error, stdout, stderr) => {
      const time = (Date.now() - startTime) / 1000;
      
      resolve({
        code: error ? (error.code || 1) : 0,
        stdout: stdout || '',
        stderr: stderr || '',
        error: error,
        time: time
      });
    });
    
    // Enviar stdin si existe
    if (stdin) {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

// Iniciar servidor
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Kotlin Compiler API ejecutándose en puerto ${PORT}`);
  console.log(`📚 Solo acepta Kotlin (language_id: 78)`);
  console.log(`🔒 Configurado para estudiantes con límites de seguridad`);
});

// Manejo de errores no capturados
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});