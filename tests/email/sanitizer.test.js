'use strict';
const{sanitizeEmailHtml,detectTrackingPixels}=require('../../src/email/sanitizer');
describe('Email HTML Sanitizer',()=>{
  test('removes script tags',()=>{const c=sanitizeEmailHtml('<p>Hello</p><script>alert("xss")</script>');expect(c).not.toContain('<script');expect(c).toContain('<p>Hello</p>');});
  test('removes javascript: href',()=>{const c=sanitizeEmailHtml('<a href="javascript:alert(1)">Click me</a>');expect(c).not.toContain('javascript:');});
  test('removes event handlers',()=>{const c=sanitizeEmailHtml('<p onclick="alert(1)">Test</p>');expect(c).not.toContain('onclick');});
  test('adds rel noopener to links',()=>{const c=sanitizeEmailHtml('<a href="https://example.com">Link</a>');expect(c).toContain('noopener');});
  test('removes tracking pixels when enabled',()=>{const c=sanitizeEmailHtml('<p>Content</p><img src="https://tracker.example.com/pixel.gif" width="1" height="1">',{removeTrackers:true});expect(c).not.toContain('tracker.example.com');});
  test('detects tracking pixels',()=>{const n=detectTrackingPixels('<img src="https://t.me/1x1.gif" width="1" height="1"><img src="https://x.com/logo.png">');expect(n).toBe(1);});
  test('handles null/empty input',()=>{expect(sanitizeEmailHtml(null)).toBe('');expect(sanitizeEmailHtml('')).toBe('');});
  test('removes iframe',()=>{const c=sanitizeEmailHtml('<iframe src="https://evil.com"></iframe><p>Safe</p>');expect(c).not.toContain('<iframe');expect(c).toContain('<p>Safe</p>');});
});
