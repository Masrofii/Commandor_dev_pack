'use client';
import{useEffect,useRef,useCallback,useState}from'react';
import{getToken}from'../lib/auth';
function getWsUrl(){
  if(process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if(typeof window!=='undefined'){
    const proto=window.location.protocol==='https:'?'wss:':'ws:';
    const local=window.location.hostname==='localhost'||window.location.hostname==='127.0.0.1';
    // `next dev` runs on 3001 while the API + WebSocket server runs on 3000.
    // Next.js rewrites do not proxy WebSocket upgrades, so target the backend
    // directly when developing locally on a different port.
    if(local&&window.location.port&&window.location.port!=='3000'){
      return `${proto}//${window.location.hostname}:3000`;
    }
    return `${proto}//${window.location.host}`;
  }
  return 'ws://localhost:3000';
}
export function useWebSocket(onMessage){const ws=useRef(null);const rt=useRef(null);const[connected,setConnected]=useState(false);const attempts=useRef(0);const MAX=10;
const connect=useCallback(()=>{const token=getToken();if(!token)return;try{const socket=new WebSocket(`${getWsUrl()}/ws`);ws.current=socket;socket.onopen=()=>socket.send(JSON.stringify({type:'auth',token}));socket.onmessage=evt=>{try{const msg=JSON.parse(evt.data);if(msg.type==='auth.ok'){setConnected(true);attempts.current=0;return;}onMessage?.(msg);}catch{}};socket.onclose=evt=>{setConnected(false);ws.current=null;if(evt.code!==4001&&attempts.current<MAX){const delay=Math.min(1000*Math.pow(2,attempts.current),30000);attempts.current++;rt.current=setTimeout(connect,delay);}};socket.onerror=()=>socket.close();}catch{}},[onMessage]);
useEffect(()=>{connect();return()=>{clearTimeout(rt.current);ws.current?.close(1000,'unmounted');};},[connect]);
useEffect(()=>{const i=setInterval(()=>{if(ws.current?.readyState===1)ws.current.send(JSON.stringify({type:'ping'}));},30000);return()=>clearInterval(i);},[]);
return{connected};}
