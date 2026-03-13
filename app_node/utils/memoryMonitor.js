/**
 * 内存监控工具
 * 用于监控 Node.js 进程的内存使用情况
 */

const { exec } = require('child_process');
const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * 获取当前内存使用情况
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / MB),
    heapTotal: Math.round(usage.heapTotal / MB),
    rss: Math.round(usage.rss / MB),
    external: Math.round(usage.external / MB),
  };
}

/**
 * 格式化内存大小
 */
function formatMemory(bytes) {
  if (bytes >= GB) {
    return (bytes / GB).toFixed(2) + ' GB';
  }
  return (bytes / MB).toFixed(2) + ' MB';
}

/**
 * 创建定期内存监控器
 * @param intervalMs 监控间隔（毫秒），默认 30000 (30秒)
 * @param thresholdMB 内存警告阈值（MB），默认 500MB
 */
function createMemoryMonitor(intervalMs = 30000, thresholdMB = 500) {
  const interval = setInterval(() => {
    const mem = getMemoryUsage();
    const totalMem = mem.rss;

    // 打印内存使用情况
    console.log(`[Memory] RSS: ${mem.rss}MB | Heap: ${mem.heapUsed}/${mem.heapTotal}MB | External: ${mem.external}MB`);

    // 如果超过阈值，发出警告
    if (totalMem > thresholdMB) {
      console.warn(`[Memory Warning] Memory usage (${totalMem}MB) exceeds threshold (${thresholdMB}MB)`);
    }
  }, intervalMs);

  // 初始打印
  console.log('[Memory Monitor] Started, initial usage:', getMemoryUsage());

  // 返回停止函数
  return {
    stop: () => {
      clearInterval(interval);
      console.log('[Memory Monitor] Stopped');
    },
    getUsage: getMemoryUsage,
  };
}

/**
 * 检查系统内存状态
 */
function getSystemMemory() {
  // 这是一个简化的实现，实际应该通过 OS 模块获取
  const mem = process.memoryUsage();
  return {
    used: mem.rss,
    total: mem.heapTotal,
    percentage: Math.round((mem.rss / mem.heapTotal) * 100),
  };
}

/**
 * 通过端口查找进程 PID
 * @param {number} port 端口号
 * @returns {Promise<number|null>} 进程 PID 或 null
 */
function findPidByPort(port) {
  return new Promise((resolve) => {
    exec(`netstat -tlnp 2>/dev/null | grep ':${port}' | grep LISTEN || ss -tlnp 2>/dev/null | grep ':${port}' | grep LISTEN`, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }
      // 匹配进程 PID，格式如: "1234/routing-server" 或 "pid=1234"
      const match = stdout.match(/(\d+)\//) || stdout.match(/pid=(\d+)/);
      if (match) {
        resolve(parseInt(match[1], 10));
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * 获取指定 PID 的进程内存使用情况
 * @param {number} pid 进程 PID
 * @returns {Promise<{rss: number, vsz: number, cpu: number, mem: number}|null>}
 */
function getProcessMemory(pid) {
  return new Promise((resolve) => {
    exec(`ps -p ${pid} -o rss=,vsz=,pcpu=,pmem=`, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 4) {
        resolve({
          rss: Math.round(parseInt(parts[0], 10) / 1024), // KB to MB
          vsz: Math.round(parseInt(parts[1], 10) / 1024), // KB to MB
          cpu: parseFloat(parts[2]),
          mem: parseFloat(parts[3]),
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * 查找 C++ 路由服务器进程
 * @returns {Promise<{pid: number, rss: number, vsz: number, cpu: number, mem: number}|null>}
 */
async function findCppServerProcess() {
  const port = 12345; // C++ 服务器端口
  const pid = await findPidByPort(port);
  if (!pid) {
    return null;
  }
  const memInfo = await getProcessMemory(pid);
  if (!memInfo) {
    return null;
  }
  return { pid, ...memInfo };
}

/**
 * 创建包含 C++ 进程监控的内存监控器
 * @param {number} intervalMs 监控间隔（毫秒）
 * @param {number} thresholdMB 内存警告阈值（MB）
 * @param {number} cppThresholdMB C++ 进程内存警告阈值（MB）
 */
function createFullMemoryMonitor(intervalMs = 30000, thresholdMB = 500, cppThresholdMB = 2000) {
  const interval = setInterval(async () => {
    // 监控 Node.js 进程
    const nodeMem = getMemoryUsage();
    console.log(`[Memory] Node.js RSS: ${nodeMem.rss}MB | Heap: ${nodeMem.heapUsed}/${nodeMem.heapTotal}MB`);

    if (nodeMem.rss > thresholdMB) {
      console.warn(`[Memory Warning] Node.js memory (${nodeMem.rss}MB) exceeds threshold (${thresholdMB}MB)`);
    }

    // 监控 C++ 进程
    try {
      const cppProcess = await findCppServerProcess();
      if (cppProcess) {
        console.log(`[Memory] C++ Server (PID:${cppProcess.pid}) RSS: ${cppProcess.rss}MB | VSZ: ${cppProcess.vsz}MB | CPU: ${cppProcess.cpu}%`);
        if (cppProcess.rss > cppThresholdMB) {
          console.warn(`[Memory Warning] C++ process memory (${cppProcess.rss}MB) exceeds threshold (${cppThresholdMB}MB)`);
        }
      } else {
        console.log('[Memory] C++ Server process not found (may not be running)');
      }
    } catch (e) {
      console.log('[Memory] Could not get C++ process info:', e.message);
    }
  }, intervalMs);

  console.log('[Full Memory Monitor] Started (Node.js + C++ process monitoring)');

  return {
    stop: () => {
      clearInterval(interval);
      console.log('[Full Memory Monitor] Stopped');
    },
    getNodeUsage: getMemoryUsage,
    getCppProcess: findCppServerProcess,
  };
}

module.exports = {
  getMemoryUsage,
  formatMemory,
  createMemoryMonitor,
  getSystemMemory,
  findCppServerProcess,
  createFullMemoryMonitor,
};
