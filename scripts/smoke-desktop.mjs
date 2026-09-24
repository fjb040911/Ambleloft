import { _electron as electron } from '@playwright/test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';

const server = http.createServer(async (req, res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const data = JSON.parse(body);
  const item = { id: 'msg_desktop', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Desktop Codex verified', annotations: [] }] };
  const response = { id: 'resp_desktop', object: 'response', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
  if (!data.stream) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response)); return; }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const [type, fields] of [['response.created', { response: { ...response, status: 'in_progress', output: [] } }], ['response.output_item.done', { output_index: 0, item }], ['response.completed', { response }]]) res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
  res.end();
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });

const dataDir = await mkdtemp(path.join(tmpdir(), 'atelier-desktop-'));
let app;
try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${dataDir}`], env: { ...process.env, ATELIER_DEV: '0' } });
  const page = await app.firstWindow();
  await page.getByRole('textbox', { name: '任务内容' }).waitFor();
  const device = await page.evaluate(() => window.desktop.getDevice());
  assert.equal(device.mode, 'desktop');
  assert.ok(device.memoryGB > 0);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/desktop-home.png' });
  await page.getByRole('textbox', { name: '任务内容' }).fill('桌面验证：整理项目');
  await page.getByRole('button', { name: '保存任务草稿' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.reload();
  await page.locator('.tree-task > button:first-child').filter({hasText:'桌面验证：整理项目'}).waitFor();
  await page.getByRole('button', { name: '扩展', exact: true }).click();
  await app.evaluate(({dialog},manifestPath)=>{
    dialog.showOpenDialog=async()=>({canceled:false,filePaths:[manifestPath]});
    dialog.showMessageBox=async()=>({response:1});
  },path.resolve('examples/extensions/workspace-guide.json'));
  await page.getByRole('button',{name:'安装扩展',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'工作台指南',exact:true}).waitFor();
  await page.getByRole('button',{name:'打开指南',exact:true}).click();
  await page.getByRole('heading',{name:'工作台指南',exact:true}).waitFor();
  await page.getByRole('button',{name:'扩展',exact:true}).click();
  await page.getByRole('button',{name:'停用',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'工作台指南',exact:true}).waitFor({state:'detached'});
  await page.reload();
  await page.getByRole('button',{name:'扩展',exact:true}).click();
  await page.getByRole('button',{name:'启用',exact:true}).click();
  await page.locator('.sidebar').getByRole('button',{name:'工作台指南',exact:true}).waitFor();
  await page.evaluate(()=>{window.confirm=()=>true;});
  await page.getByRole('button',{name:'卸载',exact:true}).click();
  await page.getByText('尚未安装扩展。',{exact:true}).waitFor();
  await page.screenshot({ path: 'test-results/desktop-extensions.png' });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button',{name:'模型提供商',exact:true}).click();
  await page.getByRole('button',{name:'添加服务'}).click();
  await page.getByLabel('服务名称',{exact:true}).fill('Local fixture');
  await page.getByLabel('Base URL', { exact: true }).fill(`http://127.0.0.1:${server.address().port}/v1`);
  await page.getByLabel('模型 ID', { exact: true }).fill('fixture-model');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('button', { name: '测试连接' }).click();
  await page.getByText('Responses 端点测试成功。', { exact: false }).waitFor();
  await page.screenshot({ path: 'test-results/desktop-provider.png' });
  await page.reload();
  await page.getByRole('textbox', { name: '任务内容' }).fill('桌面 Codex 集成验证');
  await page.getByRole('button', { name: '发送任务', exact: true }).click();
  await page.getByText('Desktop Codex verified', { exact: true }).waitFor({ timeout: 45000 });
  await page.getByText('本轮已结束', { exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/desktop-conversation.png' });
  await page.reload();
  await page.locator('.tree-task > button:first-child').filter({hasText:'桌面 Codex 集成验证'}).click();
  await page.getByText('Desktop Codex verified', { exact: true }).waitFor();
  console.log('Desktop smoke passed: extension install/navigation/disable/enable/uninstall, bridge isolation, draft persistence, endpoint configuration/test, real Codex response, conversation persistence.');
} finally {
  await app?.close();
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  await rm(dataDir, { recursive: true, force: true });
}
