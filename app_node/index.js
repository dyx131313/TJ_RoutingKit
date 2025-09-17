const express = require('express');
const net = require('net');
const path = require('path');
const monitor = require('express-status-monitor');

const app = express();
const port = 3000;

// C++ TCP 服务器的配置
const CPP_SERVER_HOST = '127.0.0.1';
const CPP_SERVER_PORT = 12345;

app.use(monitor());
app.use(express.static('../../frontend'));
// 新增：静态服务 tiles 目录，供前端离线地图访问
app.use('/tiles', express.static(path.resolve(__dirname, '../tiles')));

// 处理路由请求的函数
function handle_request(req, res) {
    const { from, to, profile } = req.query;
    const profile_str = profile || 'normal';

    // 1. 创建一个到 C++ TCP 服务器的客户端连接
    const client = new net.Socket();
    
    client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => {
        console.log('已连接到 C++ 路由计算服务');
        // 2. 发送请求数据
        const request_str = `${from},${to},${profile_str}`;
        client.write(request_str);
    });

    let response_buffer = '';
    // 3. 接收来自 C++ 服务器的响应
    client.on('data', (data) => {
        response_buffer += data.toString();
        // 假设 C++ 服务器在发送完 JSON 后会关闭连接，
        // 或者以换行符分隔消息。我们在 C++ 中添加了 '\n'。
        if (response_buffer.includes('\n')) {
            try {
                const json_output = JSON.parse(response_buffer);
                if (json_output.error) {
                    res.status(500).json(json_output);
                } else {
                    res.json(json_output);
                }
            } catch (e) {
                console.error(`解析 C++ JSON 响应时出错: ${e}`);
                console.error(`原始数据: '${response_buffer}'`);
                res.status(500).json({ error: "无法解析计算结果" });
            }
            client.end(); // 关闭连接
        }
    });

    // 4. 处理连接错误
    client.on('error', (err) => {
        console.error('与 C++ 服务连接时出错:', err.message);
        res.status(503).json({ error: '路由计算服务当前不可用。' });
    });

    // 5. 处理连接关闭
    client.on('close', () => {
        console.log('与 C++ 服务的连接已关闭');
    });
}


app.get('/route', (req, res) => {
    const { from, to } = req.query;

    if (!from || !to) {
        return res.status(400).send('错误: "from" 和 "to" 参数是必需的。');
    }
    
    handle_request(req, res);
});

app.get('/health', (req, res) => {
    // 检查 C++ TCP 服务器是否可达
    const client = new net.Socket();
    client.connect(CPP_SERVER_PORT, CPP_SERVER_HOST, () => {
        res.send('服务运行正常。C++ 路由计算服务可达。');
        client.end();
    });
    client.on('error', (err) => {
        res.status(503).send('服务运行正常，但 C++ 路由计算服务不可达。');
    });
});

app.listen(port, '127.0.0.1', () => {
    console.log(`Node.js 服务器已在 http://127.0.0.1:${port} 启动`);
    console.log(`请确保 C++ TCP 服务器正在 ${CPP_SERVER_HOST}:${CPP_SERVER_PORT} 上运行。`);
});


// 不再需要管理子进程，移除 cleanup 函数和相关的事件监听器
// function cleanup() { ... }
// process.on('SIGINT', cleanup);
// process.on('SIGTERM', cleanup);

