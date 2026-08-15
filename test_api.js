const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 4000,
  path: '/api/v1/queue/next/22222222-2222-2222-2222-222222222222',
  method: 'PATCH',
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', data));
});
req.on('error', console.error);
req.end();
