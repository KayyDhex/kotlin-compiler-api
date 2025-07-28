const express = require('express');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(express.json({ limit: '10mb' }));

// CORS para todas las solicitudes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

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

// Endpoint principal - compatible con Judge0 API
app.post('/submissions', async (req, res) => {
  try {
    const { source_code, language_id, stdin = '', wait = false } = req.body;
    
    // Validaciones
    if (!source_code) {
      return res.status(400).json({
        error: 'source_code es requerido'
      });
    }
    
    // Solo aceptar Kotlin (language_id 78)
    if (language_id && language_id !== 78) {
      return res.status(400).json({
        error: 'Solo se permite Kotlin (language_id: 78)'
      });
    }
    
    // Límites de seguridad
    if (source_code.length > 50000) { // 50KB max
      return res.status(400).json({
        error: 'Código fuente demasiado largo'
      });
    }
    
    // Compilar y ejecutar
    const result = await compileAndRunKotlin(source_code, stdin);
    
    // Formatear respuesta compatible con Judge0
    const response = {
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
    
    res.json(response);
    
  } catch (error) {
    console.error('Error processing submission:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Kotlin Compiler API - Solo para estudiantes',
    status: 'running',
    supported_language: 'Kotlin (language_id: 78)',
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Información de lenguajes (solo Kotlin)
app.get('/languages', (req, res) => {
  res.json([
    {
      id: 78,
      name: 'Kotlin',
      is_archived: false,
      source_file: 'Main.kt',
      compile_cmd: 'kotlinc Main.kt -include-runtime -d program.jar',
      run_cmd: 'java -jar program.jar'
    }
  ]);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
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