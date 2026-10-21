'use strict';
process.env.SPAM_THRESHOLD_SCORE='5';
process.env.SPAM_BLOCK_SCORE='8';
const{scoreSpam}=require('../../src/email/spamScore');
describe('Spam Scoring',()=>{
  test('legitimate email scores low',()=>{const r=scoreSpam({subject:'Meeting tomorrow at 3pm',textBody:'Hi, please confirm your availability.',sender:'colleague@company.com',spfResult:'pass',dkimResult:'pass',dmarcResult:'pass'});expect(r.score).toBeLessThan(3);expect(r.classification).toBe('ham');});
  test('spam keywords increase score',()=>{const r=scoreSpam({subject:'URGENT!!! You have WON a lottery MILLION DOLLAR prize!!!',textBody:'Claim your prize now. Act now limited time.',sender:'promo@spam.com'});expect(r.score).toBeGreaterThan(4);});
  test('SPF/DKIM/DMARC fail adds score',()=>{const r=scoreSpam({subject:'Hello',textBody:'Normal message',sender:'test@example.com',spfResult:'fail',dkimResult:'fail',dmarcResult:'fail'});expect(r.score).toBeGreaterThanOrEqual(6);expect(r.classification).toBe('spam');});
  test('phishing keywords flagged',()=>{const r=scoreSpam({subject:'Verify your account immediately',textBody:'Your password has expired. Verify your identity now.',sender:'security@phish.com',spfResult:'none'});expect(r.reasons).toContain('phishing_indicator');});
  test('returns reasons array',()=>{const r=scoreSpam({subject:'WIN NOW!!!',textBody:'ACT NOW URGENT CLICK HERE',sender:'x@y.com',spfResult:'fail'});expect(Array.isArray(r.reasons)).toBe(true);expect(r.reasons.length).toBeGreaterThan(0);});
  test('numeric sender adds score',()=>{const r=scoreSpam({subject:'Hello',textBody:'Test',sender:'1234567890@mail.example.com'});expect(r.reasons).toContain('numeric_sender');});
});
