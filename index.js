import express from 'express';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';

const app = express();

// 解析 JSON body，为了能够读取和修改 messages
app.use(express.json({ limit: '50mb' }));

// 核心逻辑：拦截请求并缝合消息
app.post('*/chat/completions', (req, res, next) => {
  if (req.body && req.body.messages && req.body.messages.length > 0) {
    const messages = req.body.messages;
    
    // 如果本来就只有一条 User 消息（比如酒馆已经处理过了），直接放行，节省性能
    if (messages.length === 1 && messages[0].role === 'user') {
        return next();
    }

    // 智能缝合开始
    let userText = messages.map(msg => {
      let text = typeof msg.content === 'string' ? msg.content : (msg.content.find(i => i.type === 'text')?.text || '');
      if (!text) return '';
      
      if (msg.role === 'system') return `[System Prompt]\n${text}\n`;
      if (msg.role === 'assistant') return `Assistant: ${text}`;
      if (msg.role === 'user') return `User: ${text}`;
      return text;
    }).filter(text => text !== '').join('\n\n');
    
    // 加上引导小尾巴
    userText += '\n\nAssistant: ';
    
    // 💥 重点：覆盖原有的 messages 数组，强制变为单 User！
    req.body.messages = [{ role: 'user', content: userText }];
    console.log('✓ 成功触发智能缝合，转换为单 User 角色发送');
  }
  next();
});

// 将修改后的单角色请求，转发给真实的 Orchid 地址
app.use('/', createProxyMiddleware({
  target: process.env.TARGET_URL || 'https://你的orchid公网地址.zeabur.app', 
  changeOrigin: true,
  // 必须加上这个修复器，否则被我们修改过的 body 传不到目标服务器
  onProxyReq: fixRequestBody 
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`智能缝合中间件已启动在端口 ${PORT}`);
});