import http from 'node:http'
import net from 'node:net'

// Sits in front of Metro so the preview page sees a device at a fixed HCMC position: a desktop browser has no
// GPS, and the worker route screen only requests a route once it has an origin. Only HTML documents are
// touched; every other request and the HMR socket are passed straight through to Metro.
export const PREVIEW_ORIGIN = { latitude: 10.7769, longitude: 106.7009 }

const GEOLOCATION_STUB = `<script>(function(){
var position={coords:{latitude:${PREVIEW_ORIGIN.latitude},longitude:${PREVIEW_ORIGIN.longitude},accuracy:15,altitude:null,altitudeAccuracy:null,heading:null,speed:null},timestamp:Date.now()};
var geo=navigator.geolocation;
if(geo){
geo.getCurrentPosition=function(ok){setTimeout(function(){ok(position)},30)};
geo.watchPosition=function(ok){setTimeout(function(){ok(position)},30);return 1};
geo.clearWatch=function(){};
}
var permissions=navigator.permissions;
if(permissions&&permissions.query){
var query=permissions.query.bind(permissions);
permissions.query=function(descriptor){
return descriptor&&descriptor.name==='geolocation'
?Promise.resolve({state:'granted',onchange:null,addEventListener:function(){},removeEventListener:function(){}})
:query(descriptor);
};
}
})();</script>`

export function startWebProxy({ port, target }) {
  const server = http.createServer((req, res) => {
    const upstream = http.request(
      { host: '127.0.0.1', port: target, path: req.url, method: req.method, headers: { ...req.headers, 'accept-encoding': 'identity' } },
      (response) => {
        const type = String(response.headers['content-type'] ?? '')
        if (!type.includes('text/html')) {
          res.writeHead(response.statusCode ?? 502, response.headers)
          response.pipe(res)
          return
        }
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf8')
          const out = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => tag + GEOLOCATION_STUB) : GEOLOCATION_STUB + html
          const headers = { ...response.headers, 'content-length': String(Buffer.byteLength(out)) }
          res.writeHead(response.statusCode ?? 200, headers)
          res.end(out)
        })
      },
    )
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    req.pipe(upstream)
  })

  server.on('upgrade', (req, socket, head) => {
    const upstream = net.connect(target, '127.0.0.1', () => {
      const lines = Object.entries(req.headers).map(([key, value]) => `${key}: ${value}`)
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`)
      upstream.write(head)
      upstream.pipe(socket)
      socket.pipe(upstream)
    })
    upstream.on('error', () => socket.destroy())
    socket.on('error', () => upstream.destroy())
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => resolve({
      close: () => new Promise((done) => {
        server.closeAllConnections()
        server.close(() => done())
      }),
    }))
  })
}
