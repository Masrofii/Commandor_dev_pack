'use strict';
const{WebSocketServer,WebSocket}=require('ws');
const{verifyWebSession}=require('../auth/sessions');
const logger=require('../monitoring/logger');
class WebSocketManager{
  constructor(){this.clients=new Map();this.wss=null;}
  attach(server){
    this.wss=new WebSocketServer({server,path:'/ws'});
    this.wss.on('connection',(ws,req)=>{
      let tgId=null,authed=false;
      const timeout=setTimeout(()=>{if(!authed)ws.close(4001,'Auth timeout');},10000);
      ws.on('message',raw=>{
        try{const msg=JSON.parse(raw.toString());
          if(!authed&&msg.type==='auth'){const s=verifyWebSession(msg.token);if(!s||s.is_banned){ws.close(4001,'Unauthorized');return;}clearTimeout(timeout);authed=true;tgId=s.tg_id;if(!this.clients.has(tgId))this.clients.set(tgId,new Set());this.clients.get(tgId).add(ws);ws.send(JSON.stringify({type:'auth.ok',tgId}));return;}
          if(!authed){ws.close(4001,'Not authenticated');return;}
          if(msg.type==='ping')ws.send(JSON.stringify({type:'pong'}));
        }catch{}
      });
      ws.on('close',()=>{clearTimeout(timeout);if(tgId&&this.clients.has(tgId)){this.clients.get(tgId).delete(ws);if(this.clients.get(tgId).size===0)this.clients.delete(tgId);}});
      ws.on('error',()=>{});
    });
    return this;
  }
  sendToUser(tgId,message){const conns=this.clients.get(tgId);if(!conns||conns.size===0)return 0;const p=JSON.stringify(message);let sent=0;for(const ws of conns)if(ws.readyState===WebSocket.OPEN){try{ws.send(p);sent++;}catch{}}return sent;}
  getConnectedCount(){let t=0;for(const s of this.clients.values())t+=s.size;return t;}
}
module.exports=new WebSocketManager();
