'use strict';
const QRCode=require('qrcode');
async function generateQRBuffer(text,opts={}){return QRCode.toBuffer(text,{width:opts.width||300,margin:2,errorCorrectionLevel:'M'});}
async function generateQRDataURL(text){return QRCode.toDataURL(text,{width:300,margin:2,errorCorrectionLevel:'M'});}
module.exports={generateQRBuffer,generateQRDataURL};
