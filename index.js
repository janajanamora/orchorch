import express from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';

const app = express();

// 解析 JSON body
app.use(express.json({ limit: '50mb' }));

app.post(['*/chat/completions', '*/messages'], (req, res, next) => {
  const isClaude = req.path.endsWith('/messages');
  let messages = req.body.messages || [];

  if (messages.length > 0) {
    let userText = '';

    if (isClaude) {
      if (req.body.system) {
        let sysText = typeof req.body.system === 'string' ? req.body.system : 
                      (Array.isArray(req.body.system) ? req.body.system.map(s => s.text).join('\n') : '');
        if (sysText) userText += `[System Prompt]\n${sysText}\n\n`;
      }
      
      userText += messages.map(msg => {
        let text = typeof msg.content === 'string' ? msg.content : 
                   (Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join('\n') : '');
        if (!text) return '';
        if (msg.role === 'assistant') return `Assistant: ${text}`;
        if (msg.role === 'user') return `User: ${text}`;
        return text;
      }).filter(t => t !== '').join('\n\n');
      
      userText += '\n\nAssistant: ';
      
      req.body.system = ""; 
      req.body.messages = [{ role: 'user', content: userText }];
      
      console.log('✓ 成功触发缝合 (Claude 格式)，转换为单 User 角色发送');

    } else {
      userText = messages.map(msg => {
        let text = typeof msg.content === 'string' ? msg.content : 
                   (Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join('\n') : '');
        if (!text) return '';
        if (msg.role === 'system') return `[System Prompt]\n${text}\n`;
        if (msg.role === 'assistant') return `Assistant: ${text}`;
        if (msg.role === 'user') return `User: ${text}`;
        return text;
      }).filter(t => t !== '').join('\n\n');
      
      userText += '\n\nAssistant: ';
      req.body.messages = [{ role: 'user', content: userText }];
      
      console.log('✓ 成功触发缝合 (OpenAI 格式)，转换为单 User 角色发送');
    }
  }
  
  next();
});

// 💥 核心修复区：完美适配 v3 版本的重构包发送机制
app.use('/', createProxyMiddleware({
  target: process.env.TARGET_URL || 'http://orch.zeabur.internal:8080', 
  changeOrigin: true,
  on: {
    proxyReq: fixRequestBody // 语法从 onProxyReq 改为了 on: { proxyReq }
  }
}));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`万能智能缝合中间件已启动在端口 ${PORT}`);
});
