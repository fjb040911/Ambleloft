import {expect} from '@playwright/test';
import {Database} from '../../electron/database.cjs';

export async function seedRuns(directory, ...runs) {
  const database = new Database(directory);
  try {
    await database.call('saveRunUpdates', runs);
  } finally {
    await database.close();
  }
}

export async function openExtensionCenter(page) {
  await showExtensionEntries(page);
  await page.getByRole('button', {name: '技能与扩展', exact: true}).click();
}

export async function showExtensionEntries(page) {
  const entry = page.locator('.activity-rail').getByRole('button', {name: '扩展', exact: true});
  if (await entry.getAttribute('aria-expanded') !== 'true') await entry.click();
}

export async function installExtension(page, {development = false} = {}) {
  await page.getByRole('button', {name: '从本地安装', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: '从本地安装', exact: true});
  if (development) {
    await dialog.getByRole('button', {name: '更多安装方式', exact: true}).click();
    await page.getByRole('menuitem', {name: '加载开发目录', exact: true}).click();
  } else {
    await dialog.getByRole('button', {name: '安装扩展', exact: true}).click();
  }
  await expect(dialog.getByRole('button', {name: '安装扩展', exact: true})).toBeEnabled();
  await dialog.getByRole('button', {name: '返回已安装', exact: true}).click();
}

export async function manageExtension(page, name) {
  const row = page.locator('.store-installed-row').filter({has: page.getByRole('heading', {name, exact: true})});
  const manage = row.getByRole('button', {name: new RegExp('^(管理 |设置与权限$)')});
  const detail = page.locator('.extension-detail').getByRole('heading', {name, exact: true});
  await expect(manage.or(detail).first()).toBeVisible();
  if (await manage.isVisible()) await manage.click();
}

export async function showTasks(page) {
  const entry = page.getByRole('navigation', {name: '分组导航'}).getByRole('button', {name: '任务', exact: true});
  if (await entry.getAttribute('aria-expanded') !== 'true') await entry.click();
}

export function taskButton(page, title) {
  return page.getByRole('complementary', {name: '主导航'}).getByRole('button', {name: title}).first();
}

export async function openProjectFile(page, name, {pin = false} = {}) {
  const tree = page.getByRole('complementary', {name: '项目文件树'});
  const toggle = page.getByRole('button', {name: '显示/隐藏文件树', exact: true});
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
  const file = tree.getByRole('treeitem', {name, exact: true});
  if (pin) await file.dblclick();
  else await file.click();
}
