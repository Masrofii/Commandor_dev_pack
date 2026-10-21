'use client';
import{useState,useCallback}from'react';
import useSWR from'swr';
import{api}from'../lib/api';
export function useInbox(initialParams={}){
  const[params,setParams]=useState({page:1,limit:20,...initialParams});
  const{data,error,isLoading,mutate}=useSWR(['emails',params],()=>api.getEmails(params),{refreshInterval:60000,revalidateOnFocus:true});
  const refresh=useCallback(()=>mutate(),[mutate]);
  const handleNewEmail=useCallback(msg=>{if(msg.type==='email.received'||msg.type==='email.deleted')mutate();},[mutate]);
  return{emails:data?.emails||[],total:data?.total||0,page:params.page,limit:params.limit,isLoading,error,refresh,handleNewEmail,setParams,nextPage:()=>setParams(p=>({...p,page:p.page+1})),prevPage:()=>setParams(p=>({...p,page:Math.max(1,p.page-1)}))};
}
