const https = require('https');

const CORS = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

function httpsGet(urlStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const options = { hostname: u.hostname, path: u.pathname + u.search, method: 'GET' };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const options = { hostname, path, method: 'POST', headers };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Access-Control-Allow-Headers': 'Content-Type,x-target-url', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
      body: ''
    };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  // Spoonacular proxy — client sends URL in x-target-url header, function injects API key server-side
  const targetUrl = (event.headers || {})['x-target-url'];
  if (targetUrl && targetUrl.includes('spoonacular.com')) {
    const key = process.env.SPOONACULAR_KEY;
    if (!key) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'SPOONACULAR_KEY not set in Netlify environment variables.' }) };
    }
    const sep = targetUrl.includes('?') ? '&' : '?';
    try {
      const result = await httpsGet(targetUrl + sep + 'apiKey=' + encodeURIComponent(key));
      return { statusCode: result.statusCode, headers: CORS, body: result.body };
    } catch (err) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
    }
  }

  // Anthropic proxy
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: { message: 'API key not configured. Add ANTHROPIC_API_KEY to Netlify environment variables.' } })
    };
  }

  const bodyData = event.body;
  try {
    const result = await httpsPost(
      'api.anthropic.com',
      '/v1/messages',
      {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(bodyData)
      },
      bodyData
    );
    return { statusCode: result.statusCode, headers: CORS, body: result.body };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: { message: err.message } }) };
  }
};
