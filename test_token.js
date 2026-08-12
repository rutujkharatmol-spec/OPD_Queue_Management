const http = require('http');

const data = JSON.stringify({
  patientId: '11111111-1111-1111-1111-111111111111',
  departmentId: '11111111-1111-1111-1111-111111111111',
  doctorId: '22222222-2222-2222-2222-222222222222',
  priority: 'NORMAL'
});

const req = http.request({
  hostname: 'localhost',
  port: 4000,
  path: '/api/v1/tokens',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Body:', body));
});

req.on('error', console.error);
req.write(data);
req.end();
