// WebSocket (/ws) <-> rtl_tcp bridge. The receiver page is hosted elsewhere (GitHub Pages).
const http=require('http'),net=require('net'),{WebSocketServer}=require('ws');
const PORT=+process.env.PORT||8080;
const HOST=process.env.UPSTREAM_HOST||'193.24.208.6', UP=+process.env.UPSTREAM_PORT||1240;
const TOKEN=process.env.TOKEN||'';                                   // optional shared secret, sent as ?token=
const ORIGINS=(process.env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean); // e.g. https://you.github.io
const MAX=+process.env.MAX_CLIENTS||2;
const srv=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end(req.url==='/health'?'ok':'rtl-tcp bridge')});
const wss=new WebSocketServer({noServer:true});let n=0;
srv.on('upgrade',(req,sock,head)=>{
 const u=new URL(req.url,'http://x');
 const bad=u.pathname!=='/ws'||(TOKEN&&u.searchParams.get('token')!==TOKEN)||(ORIGINS.length&&!ORIGINS.includes(req.headers.origin))||n>=MAX;
 if(bad){sock.write('HTTP/1.1 403 Forbidden\r\n\r\n');sock.destroy();return}
 wss.handleUpgrade(req,sock,head,ws=>wss.emit('connection',ws))});
wss.on('connection',ws=>{
 n++;const s=net.connect(UP,HOST);s.setNoDelay(true);
 s.on('data',d=>{if(ws.readyState===1&&ws.bufferedAmount<2e6)ws.send(d)});
 ws.on('message',m=>{if(m.length===5)s.write(m)});
 const end=()=>{s.destroy();ws.terminate()};
 ws.on('close',()=>{n--;s.destroy()});ws.on('error',end);s.on('close',()=>ws.close());s.on('error',end)});
srv.listen(PORT,'0.0.0.0',()=>console.log('bridge on :'+PORT+' -> '+HOST+':'+UP));
