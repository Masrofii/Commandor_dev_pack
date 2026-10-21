'use client';
export function saveToken(t){try{localStorage.setItem('session_token',t);}catch{}}
export function getToken(){try{return localStorage.getItem('session_token');}catch{return null;}}
export function clearToken(){try{localStorage.removeItem('session_token');localStorage.removeItem('current_user');}catch{}}
export function saveUser(u){try{localStorage.setItem('current_user',JSON.stringify(u));}catch{}}
export function getUser(){try{const u=localStorage.getItem('current_user');return u?JSON.parse(u):null;}catch{return null;}}
export function isAuthenticated(){return!!getToken();}
export function isAdmin(){return getUser()?.role==='admin';}
