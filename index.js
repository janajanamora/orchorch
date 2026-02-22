import express from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';

const app = express();

// 解析 JSON body
app.use(express.json({ limit: '50mb' }));

// 💥 史诗级升级：同时拦截 OpenAI 格式和 Claude 格式！
app.post(['*/chat/completions', '*/messages'], (req, res, next) => {
  const isClaude = req.path.endsWith('/messages');
  let messages = req.body.messages || [];

  if (messages.length > 0) {
    let userText = '';

    // 如果是 Claude 格式 (/v1/messages)
    if (isClaude) {
      // 1. 提取 Claude 独有的顶层 system 提示词
      if (req.body.system) {
        let sysText = typeof req.body.system === 'string' ? req.body.system : 
                      (Array.isArray(req.body.system) ? req.body.system.map(s => s.text).join('\n') : '');
        if (sysText) userText += `[System Prompt]\n${sysText}\n\n`;
      }
      
      // 2. 缝合所有历史消息
      userText += messages.map(msg => {
        let text = typeof msg.content === 'string' ? msg.content : 
                   (Array.isArray(msg.content) ? msg.content.map(c => c.text || '').join('\n') : '');
        if (!text) return '';
        if (msg.role === 'assistant') return `Assistant: ${text}`;
        if (msg.role === 'user') return `User: ${text}`;
        return text;
      }).filter(t => t !== '').join('\n\n');
      
      userText += '\n\nAssistant: ';
      
      // 3. 抹除原有的多角色，强行变成单 User！
      req.body.system = ""; // 清空外部 system 防止 Orchid 报错
      req.body.messages = [{ role: 'user', content: userText }];
      
      console.log('✓ 成功触发缝合 (Claude 格式)，转换为单 User 角色发送');

    } else {
      // 如果是 OpenAI 格式 (/v1/chat/completions)
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

// 代理转发给真实的 Orchid
app.use('/', createProxyMiddleware({
  target: process.env.TARGET_URL || 'https://orch.zeabur.app', 
  changeOrigin: true,
  onProxyReq: fixRequestBody 
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`万能智能缝合中间件已启动在端口 ${PORT}`);
});
