const http = require('http');
const https = require('https');
const url = require('url');

const PORT = process.env.PORT || 8080;

// Cache en memoria para respuestas rápidas
const cache = new Map();

// APIs backup si una falla
const APIS = [
  {
    name: 'CodeX',
    url: 'https://api.codex.jaagrav.in',
    transform: (code, stdin) => ({
      language: 'kt',
      code: code,
      input: stdin || ''
    }),
    parseResponse: (data) => {
      if (data.error) {
        return {
          success: false,
          output: '',
          error: data.error,
          status: 'Compilation Error'
        };
      }
      return {
        success: !data.error,
        output: data.output || '',
        error: data.error || '',
        status: data.error ? 'Runtime Error' : 'Accepted'
      };
    }
  },
  {
    name: 'OneCompiler',
    url: 'https://onecompiler.com/api/code/exec',
    transform: (code, stdin) => ({
      language: 'kotlin',
      stdin: stdin || '',
      files: [{
        name: 'main.kt',
        content: code
      }]
    }),
    parseResponse: (data) => ({
      success: !data.exception,
      output: data.stdout || '',
      error: data.stderr || data.exception || '',
      status: data.exception ? 'Compilation Error' : 'Accepted'
    })
  },
  {
    name: 'Programiz',
    url: 'https://api.programiz.com/compiler-api/compile',
    transform: (code, stdin) => ({
      language: 'kotlin',
      version: 'latest',
      code: code,
      input: stdin || ''
    }),
    parseResponse: (data) => ({
      success: data.success,
      output: data.output || '',
      error: data.error || '',
      status: data.success ? 'Accepted' : 'Compilation Error'
    })
  }
];

// Función para hacer request HTTPS
function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: 'Invalid JSON response', raw: data });
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

// Intentar compilar con múltiples APIs
async function compileKotlin(code, stdin = '') {
  const cacheKey = `${code}:${stdin}`;
  
  // Verificar cache
  if (cache.has(cacheKey)) {
    console.log('Cache hit');
    return cache.get(cacheKey);
  }

  // Intentar con cada API hasta que una funcione
  for (const api of APIS) {
    try {
      console.log(`Trying ${api.name}...`);
      
      const requestData = api.transform(code, stdin);
      const parsedUrl = new URL(api.url);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'KotlinCompilerAPI/1.0',
          'Accept': 'application/json'
        }
      };

      const response = await makeRequest(options, requestData);
      const result = api.parseResponse(response);
      
      // Si funciona, guardar en cache y retornar
      if (result !== null) {
        cache.set(cacheKey, result);
        console.log(`${api.name} success!`);
        return result;
      }
      
    } catch (error) {
      console.log(`${api.name} failed:`, error.message);
      continue;
    }
  }

  // Si todas las APIs fallan
  return {
    success: false,
    output: '',
    error: 'All compiler services are temporarily unavailable',
    status: 'Service Error'
  };
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
        message: 'Kotlin Compiler Proxy API',
        status: 'running',
        supported_language: 'Kotlin (language_id: 78)',
        version: '2.0.0',
        features: ['Multiple API fallbacks', 'In-memory caching', 'High availability']
      }));
    }
    else if (req.method === 'GET' && path === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ 
        status: 'healthy',
        cache_size: cache.size,
        available_apis: APIS.length
      }));
    }
    else if (req.method === 'GET' && path === '/languages') {
      res.writeHead(200);
      res.end(JSON.stringify([{
        id: 78,
        name: 'Kotlin',
        is_archived: false,
        source_file: 'Main.kt'
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

          // Compilar usando APIs externas
          const startTime = Date.now();
          const result = await compileKotlin(source_code, stdin);
          const time = (Date.now() - startTime) / 1000;

          // Formatear respuesta compatible con Judge0
          const response = {
            token: `proxy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            status: {
              id: result.success ? 3 : (result.status === 'Compilation Error' ? 6 : 5),
              description: result.status
            },
            stdout: result.output,
            stderr: result.error,
            compile_output: result.error,
            time: time,
            memory: null,
            created_at: new Date().toISOString(),
            finished_at: new Date().toISOString()
          };

          res.writeHead(200);
          res.end(JSON.stringify(response));
          
        } catch (error) {
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

// Limpiar cache cada hora
setInterval(() => {
  cache.clear();
  console.log('Cache cleared');
}, 3600000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Kotlin Compiler Proxy API running on port ${PORT}`);
  console.log(`📚 Multiple fallback APIs configured`);
  console.log(`⚡ In-memory caching enabled`);
  console.log(`🔒 Railway hosted with unlimited requests`);
});

// Manejo de errores
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});