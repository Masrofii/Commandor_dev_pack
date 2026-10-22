'use client';
export function saveToken(t){try{if(typeof window!=='undefined')localStorage.setItem('session_token',t);}catch{}}
export function getToken(){try{return typeof window!=='undefined'?localStorage.getItem('session_token'):null;}catch{return null;}}
export function clearToken(){try{if(typeof window!=='undefined'){localStorage.removeItem('session_token');localStorage.removeItem('current_user');}}catch{}}
export function saveUser(u){try{if(typeof window!=='undefined')localStorage.setItem('current_user',JSON.stringify(u));}catch{}}
export function getUser(){try{const u=typeof window!=='undefined'?localStorage.getItem('current_user'):null;return u?JSON.parse(u):null;}catch{return null;}}
export function isAuthenticated(){return!!getToken();}
export function isAdmin(){return getUser()?.role==='admin';}
