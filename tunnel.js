const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

let tunnelProcess = null;
let currentTunnelUrl = null;
let startingPromise = null;

/**
 * Get primary local IPv4 address
 */
function getLocalIp() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        const family = typeof net.family === 'string' ? net.family : (net.family === 4 ? 'IPv4' : '');
        if (family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
          return net.address;
        }
      }
    }
  } catch (e) {}
  return '127.0.0.1';
}

/**
 * Locate cloudflared.exe binary
 */
function findCloudflared() {
  const candidates = [
    path.join(__dirname, 'cloudflared.exe'),
    'C:\\MamyOne\\cloudflared.exe',
    path.join(process.cwd(), 'cloudflared.exe')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Get current tunnel status
 */
function getTunnelStatus() {
  return {
    running: !!tunnelProcess && !!currentTunnelUrl,
    url: currentTunnelUrl,
    localIp: getLocalIp()
  };
}

/**
 * Stop active tunnel process
 */
function stopTunnel() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill();
    } catch (e) {}
    tunnelProcess = null;
  }
  currentTunnelUrl = null;
  startingPromise = null;
  return { running: false, url: null, localIp: getLocalIp() };
}

/**
 * Start or retrieve cloudflare tunnel
 */
function startTunnel(port = 3000) {
  if (currentTunnelUrl && tunnelProcess) {
    return Promise.resolve({
      running: true,
      url: currentTunnelUrl,
      localIp: getLocalIp()
    });
  }

  if (startingPromise) {
    return startingPromise;
  }

  const binary = findCloudflared();
  if (!binary) {
    return Promise.reject(new Error('ملف cloudflared.exe غير موجود.'));
  }

  startingPromise = new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        startingPromise = null;
        reject(new Error('مهلة بدء النفق السحابي انتهت (30 ثانية). يرجى التحقق من اتصال الإنترنت.'));
      }
    }, 30000);

    try {
      const child = spawn(binary, [
        'tunnel',
        '--url', `http://localhost:${port}`,
        '--protocol', 'http2'
      ], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      tunnelProcess = child;

      const onData = (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          currentTunnelUrl = match[0];
          startingPromise = null;
          console.log(`[Cloudflare Tunnel] Connected successfully: ${currentTunnelUrl}`);
          resolve({
            running: true,
            url: currentTunnelUrl,
            localIp: getLocalIp()
          });
        }
      };

      child.stdout.on('data', onData);
      child.stderr.on('data', onData);

      child.on('error', (err) => {
        console.error('[Cloudflare Tunnel] Process error:', err);
        tunnelProcess = null;
        currentTunnelUrl = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          startingPromise = null;
          reject(err);
        }
      });

      child.on('exit', (code) => {
        console.log(`[Cloudflare Tunnel] Process exited with code ${code}`);
        tunnelProcess = null;
        currentTunnelUrl = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          startingPromise = null;
          reject(new Error(`انتهت عملية النفق السحابي بكود: ${code}`));
        }
      });
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        startingPromise = null;
        reject(err);
      }
    }
  });

  return startingPromise;
}

process.on('exit', () => {
  stopTunnel();
});

module.exports = {
  startTunnel,
  stopTunnel,
  getTunnelStatus,
  getLocalIp
};
