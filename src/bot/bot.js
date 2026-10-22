'use strict';
const{Telegraf}=require('telegraf');
const config=require('../../config/config');
const{setupCommands}=require('./commands');
const{setupCallbacks}=require('./callbacks');
const{setupInlineMode}=require('./inline');
const logger=require('../monitoring/logger');
let botInstance=null;
function createBot(){
  if(!config.telegram.token){logger.warn('TELEGRAM_BOT_TOKEN not set;bot disabled');return null;}
  const bot=new Telegraf(config.telegram.token);
  bot.catch((err,ctx)=>{logger.error({err:err.message,updateType:ctx.updateType},'Bot error');});
  
  // Banned user security gate
  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (fromId) {
      try {
        const { getDb } = require('../../database/database');
        const u = getDb().prepare('SELECT is_banned, ban_reason FROM users WHERE tg_id=?').get(fromId);
        if (u?.is_banned) {
          if (ctx.callbackQuery) {
            return ctx.answerCbQuery('⛔ Your account has been suspended.', { show_alert: true }).catch(() => {});
          }
          return ctx.reply(`⛔ <b>Account Suspended</b>\n\nYour access to the platform has been suspended by an administrator.\n<b>Reason:</b> <i>${u.ban_reason || 'Administrative restriction'}</i>`, { parse_mode: 'HTML' }).catch(() => {});
        }
      } catch {}
    }
    return next();
  });

  setupCommands(bot);setupCallbacks(bot);setupInlineMode(bot);
  botInstance=bot;return bot;
}
function getBot(){return botInstance;}
function startBot(bot){
  if(!bot)return;
  try{
    bot.launch({allowedUpdates:['message','callback_query','inline_query']})
      .then(()=>logger.info('Telegram bot stopped'))
      .catch(err=>logger.error({err:err.message},'Telegram bot error'));
    logger.info('Telegram bot started');
  }catch(err){
    logger.error({err:err.message},'Bot launch failed');
  }
}
module.exports={createBot,startBot,getBot};
