/**
 * 等待服务启动就绪（最多等 15 秒）
 * 供 package.json test 脚本内部使用
 */

const URL = 'http://localhost:3131/health';
const MAX_MS = 15_000;
const INTERVAL_MS = 500;

const start = Date.now();
process.stdout.write('等待服务启动');

while (true) {
  try {
    const res = await fetch(URL);
    if (res.ok) {
      console.log(' ✅\n');
      process.exit(0);
    }
  } catch {
    // 服务还未就绪，继续等待
  }

  if (Date.now() - start >= MAX_MS) {
    console.error('\n\n❌ 服务未能在 15 秒内启动，请检查：');
    console.error('  1. .env 文件中的 DASHSCOPE_API_KEY / DEEPSEEK_API_KEY 是否配置');
    console.error('  2. 端口 3131 是否被占用（lsof -i :3131）');
    console.error('  3. pnpm install 是否完成');
    process.exit(1);
  }

  await new Promise((r) => setTimeout(r, INTERVAL_MS));
  process.stdout.write('.');
}
