const http = require('http');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 8080;

// Función para compilar y ejecutar Kotlin LOCALMENTE
async function compileKotlinLocal(sourceCode, stdin = '') {
  const sessionId = crypto.randomUUID().substring(0, 8);
  const tempDir = `/tmp/kotlin_${sessionId}`;
  const sourceFile = path.join(tempDir, 'Main.kt');
  const jarFile = path.join(tempDir, 'program.jar');
  
  console.log(`Starting compilation for session: ${sessionId}`);
  
  try {
    // Crear directorio temporal
    await fs.mkdir(tempDir, { recursive: true });
    console.log(`Created temp directory: ${tempDir}`);
    
    // Escribir código fuente
    await fs.writeFile(sourceFile, sourceCode, 'utf8');
    console.log(`Written source file: ${sourceFile}`);
    
    // Compilar con kotlinc local
    const compileResult = await executeCommand(
      `/app/kotlinc/bin/kotlinc "${sourceFile}" -include-runtime -d "${jarFile}"`,
      tempDir,
      30000 // 30 segundos para compilar
    );
    
    console.log(`Compile result:`, compileResult);
    
    if (compileResult.code !== 0) {
      return {
        success: false,
        output: '',
        error: compileResult.stderr || compileResult.stdout || 'Error de compilación',
        status: 'Compilation Error',
        time: compileResult.time,
        memory: null
      };
    }
    
    // Ejecutar JAR
    const runResult = await executeCommand(
      `java -Xmx128m -jar "${jarFile}"`,
      tempDir,
      20000, // 20 segundos para ejecutar
      stdin
    );
    
    console.log(`Run result:`, runResult);
    
    return {
      success: runResult.code === 0,
      output: runResult.stdout || '',
      error: runResult.stderr || '',
      status: runResult.code === 0 ? 'Accepted' : 'Runtime Error',
      time: runResult.time,
      memory: null
    };
    
  } catch (error) {
    console.error(`Error in compilation:`, error);
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
      console.log(`Cleaned up: ${tempDir}`);
    } catch (cleanupError) {
      console.error('Error cleaning up:', cleanupError);
    }
  }
}

// Función para ejecutar comandos
function executeCommand(command, cwd, timeout = 10000, stdin = '') {
  return new Promise((resolve) => {
    const startTime = Date.now();
    console.log(`Executing: ${command}`);
    console.log(`Working directory: ${cwd}`);
    
    const child = exec(command, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024, // 1MB buffer
      env: { 
        ...process.env, 
        JAVA_HOME: '/usr/lib/jvm/java-11-openjdk-amd64',
        PATH: '/app/kotlinc/bin:' + process.env.PATH
      }
    }, (error, stdout, stderr) => {
      const time = (Date.now() - startTime) / 1000;
      
      console.log(`Command finished in ${time}s`);
      console.log(`Exit code: ${error ? error.code : 0}`);
      console.log(`Stdout: ${stdout}`);
      console.log(`Stderr: ${stderr}`);
      
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
      console.log(`Sending stdin: ${stdin}`);
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

// Servidor HTTP
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
        message: 'Kotlin Compiler API - LOCAL Installation',
        status: 'running',
        supported_language: 'Kotlin (language_id: 78)',
        version: '3.0.0',
        type: 'Local Kotlin Installation',
        unlimited: true
      }));
    }
    else if (req.method === 'GET' && path === '/health') {
      // Verificar que Kotlin esté instalado
      try {
        const kotlinVersion = await executeCommand('/app/kotlinc/bin/kotlinc -version', '/tmp', 5000);
        res.writeHead(200);
        res.end(JSON.stringify({ 
          status: 'healthy',
          kotlin_available: kotlinVersion.code === 0,
          kotlin_version: kotlinVersion.stderr || kotlinVersion.stdout || 'Unknown'
        }));
      } catch (error) {
        res.writeHead(200);
        res.end(JSON.stringify({ 
          status: 'degraded',
          kotlin_available: false,
          error: 'Kotlin not properly installed'
        }));
      }
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
          const { source_code, language_id, stdin = '' } = data;
          
          // Validaciones
          if (!source_code) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'source_code es requerido' }));
            return;
          }
          
          if (language_id && language_id !== 78) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Solo se permite Kotlin (language_id: 78)' }));
            return;
          }
          
          if (source_code.length > 50000) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Código fuente demasiado largo' }));
            return;
          }

          // Compilar usando instalación local
          const result = await compileKotlinLocal(source_code, stdin);

          // Formatear respuesta compatible con Judge0
          const response = {
            token: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

          res.writeHead(200);
          res.end(JSON.stringify(response));
          
        } catch (error) {
          console.error('Error processing submission:', error);
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON request' }));
        }
      });
    }
    else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Kotlin LOCAL Compiler API running on port ${PORT}`);
  console.log(`📚 Using LOCAL Kotlin installation`);
  console.log(`♾️ UNLIMITED requests - your own server!`);
  console.log(`🏠 Hosted on Railway with your subscription`);
});

// Verificar instalación de Kotlin al iniciar
executeCommand('/app/kotlinc/bin/kotlinc -version', '/tmp', 5000)
  .then(result => {
    if (result.code === 0) {
      console.log('✅ Kotlin installation verified');
      console.log(`📋 Version: ${result.stderr || result.stdout}`);
    } else {
      console.log('❌ Kotlin installation failed');
      console.log(`Error: ${result.stderr || result.stdout}`);
    }
  })
  .catch(error => {
    console.log('❌ Cannot verify Kotlin installation:', error.message);
  });

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});