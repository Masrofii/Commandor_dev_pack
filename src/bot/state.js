'use strict';
// Short-lived per-user conversation state for flows that need a follow-up
// message (search queries, email replies, custom aliases, broadcasts).
const pendingSearch=new Map();
const pendingReply=new Map();
const pendingCustomAlias=new Map();
const pendingBroadcast=new Map();
const pendingBroadcastConfirm=new Map();
const pendingSubdomain=new Map();
const pendingSubdomainTarget=new Map();
const pendingSubdomainBody=new Map();
const pendingAddNode=new Map();
const pendingDeploySite=new Map();
const pendingSiteHtml=new Map();
const TTL=5*60*1000;
function set(map,tgId,value){
  const obj = (typeof value === 'object' && value !== null) ? value : { val: value };
  map.set(tgId,{...obj,at:Date.now()});
}
function take(map,tgId){const v=map.get(tgId);if(!v)return null;if(Date.now()-v.at>TTL){map.delete(tgId);return null;}map.delete(tgId);return v;}
function peek(map,tgId){const v=map.get(tgId);if(!v)return null;if(Date.now()-v.at>TTL){map.delete(tgId);return null;}return v;}

function clearAllUserStates(tgId) {
  pendingSearch.delete(tgId);
  pendingReply.delete(tgId);
  pendingCustomAlias.delete(tgId);
  pendingBroadcast.delete(tgId);
  pendingBroadcastConfirm.delete(tgId);
  pendingSubdomain.delete(tgId);
  pendingSubdomainTarget.delete(tgId);
  pendingSubdomainBody.delete(tgId);
  pendingAddNode.delete(tgId);
  pendingDeploySite.delete(tgId);
  pendingSiteHtml.delete(tgId);
}

module.exports={
  clearAllUserStates,
  setSearch:(tgId,v)=>set(pendingSearch,tgId,v),
  takeSearch:tgId=>take(pendingSearch,tgId),
  peekSearch:tgId=>peek(pendingSearch,tgId),
  setReply:(tgId,v)=>set(pendingReply,tgId,v),
  takeReply:tgId=>take(pendingReply,tgId),
  peekReply:tgId=>peek(pendingReply,tgId),
  setCustomAlias:(tgId,v)=>set(pendingCustomAlias,tgId,v),
  takeCustomAlias:tgId=>take(pendingCustomAlias,tgId),
  peekCustomAlias:tgId=>peek(pendingCustomAlias,tgId),
  setBroadcast:(tgId,v)=>set(pendingBroadcast,tgId,v),
  takeBroadcast:tgId=>take(pendingBroadcast,tgId),
  peekBroadcast:tgId=>peek(pendingBroadcast,tgId),
  setBroadcastConfirm:(tgId,v)=>set(pendingBroadcastConfirm,tgId,v),
  takeBroadcastConfirm:tgId=>take(pendingBroadcastConfirm,tgId),
  peekBroadcastConfirm:tgId=>peek(pendingBroadcastConfirm,tgId),
  setSubdomain:(tgId,v)=>set(pendingSubdomain,tgId,v),
  takeSubdomain:tgId=>take(pendingSubdomain,tgId),
  peekSubdomain:tgId=>peek(pendingSubdomain,tgId),
  setSubdomainTarget:(tgId,v)=>set(pendingSubdomainTarget,tgId,v),
  takeSubdomainTarget:tgId=>take(pendingSubdomainTarget,tgId),
  peekSubdomainTarget:tgId=>peek(pendingSubdomainTarget,tgId),
  setSubdomainBody:(tgId,v)=>set(pendingSubdomainBody,tgId,v),
  takeSubdomainBody:tgId=>take(pendingSubdomainBody,tgId),
  peekSubdomainBody:tgId=>peek(pendingSubdomainBody,tgId),
  setAddNode:(tgId,v)=>set(pendingAddNode,tgId,v),
  takeAddNode:tgId=>take(pendingAddNode,tgId),
  peekAddNode:tgId=>peek(pendingAddNode,tgId),
  setDeploySite:(tgId,v)=>set(pendingDeploySite,tgId,v),
  takeDeploySite:tgId=>take(pendingDeploySite,tgId),
  peekDeploySite:tgId=>peek(pendingDeploySite,tgId),
  setSiteHtml:(tgId,v)=>set(pendingSiteHtml,tgId,v),
  takeSiteHtml:tgId=>take(pendingSiteHtml,tgId),
  peekSiteHtml:tgId=>peek(pendingSiteHtml,tgId),
};
