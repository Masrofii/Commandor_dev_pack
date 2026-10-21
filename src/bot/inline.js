'use strict';
const{getAllowedDomains}=require('../services/aliasService');
const{getDb}=require('../../database/database');
const{generateAliasLocalPart}=require('../utils/helpers');
function setupInlineMode(bot){
  bot.on('inline_query',async ctx=>{
    const user=getDb().prepare('SELECT tg_id FROM users WHERE tg_id=?').get(ctx.from.id);
    if(!user)return ctx.answerInlineQuery([{type:'article',id:'register',title:'Register first',description:'Start the bot to register',input_message_content:{message_text:'Please start the bot to register.'}}],{cache_time:0});
    const domains=getAllowedDomains(ctx.from.id);
    const results=[{type:'article',id:'new_alias',title:'➕ Generate new alias',description:`Create a throwaway alias on ${domains[0]||'default domain'}`,input_message_content:{message_text:'Use /new in the bot to generate a new alias.'}},{type:'article',id:'new_burner',title:'🔥 Generate burner alias',description:'Create a 1-hour burner alias',input_message_content:{message_text:'Use /burner in the bot to generate a burner alias.'}}];
    for(const d of domains.slice(0,3))results.push({type:'article',id:`domain_${d}`,title:`📧 Alias on ${d}`,description:`Example: ${generateAliasLocalPart(6)}@${d}`,input_message_content:{message_text:`Use /new to create an alias on ${d}`}});
    return ctx.answerInlineQuery(results,{cache_time:0,is_personal:true});
  });
}
module.exports={setupInlineMode};
