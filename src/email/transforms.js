'use strict';
const{sanitizeEmailHtml}=require('./sanitizer');
function applyTransforms(email,opts={}){const result={...email};if(opts.removeTrackers!==false)result.clean_html=sanitizeEmailHtml(email.html_body,{removeTrackers:true});if(opts.normalizeSubject&&result.subject){const{normalizeSubject}=require('../utils/helpers');result.subject=normalizeSubject(result.subject);}return result;}
module.exports={applyTransforms};
