const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const initialState = () => ({ tasks: [], projects: [], theme: 'system' });

function validateState(value) {
  if (!value || !Array.isArray(value.tasks) || !Array.isArray(value.projects) ||
      !['system', 'light', 'dark'].includes(value.theme) || value.tasks.length > 1000 || value.projects.length > 500) {
    throw new Error('工作台数据格式不正确');
  }
  for (const task of value.tasks) {
    if(task.selectedSkillIds!==undefined&&(!Array.isArray(task.selectedSkillIds)||task.selectedSkillIds.length>20||task.selectedSkillIds.some(id=>typeof id!=='string'||id.length>120)))throw new Error('草稿技能格式无效');
    if (typeof task.id !== 'string' || typeof task.prompt !== 'string' || !task.prompt.trim() || task.prompt.length > 20000 ||
        typeof task.createdAt !== 'string' || typeof task.modelId !== 'string' ||
        typeof task.title !== 'string' || task.status !== 'draft' ||
        !(task.projectId === null || typeof task.projectId === 'string')) throw new Error('任务数据格式不正确');
  }
  for (const project of value.projects) {
    if (typeof project.id !== 'string' || typeof project.name !== 'string' ||
        typeof project.path !== 'string' || typeof project.createdAt !== 'string' || (project.description !== undefined && (typeof project.description !== 'string' || project.description.length > 10000))) throw new Error('项目数据格式不正确');
  }
  if(value.language!==undefined&&!['system','zh-CN','en'].includes(value.language))throw new Error('语言设置无效');
  if(value.fontScale!==undefined&&![90,100,110,120,130].includes(value.fontScale))throw new Error('字体大小设置无效');
  return { ...(value.fontScale!==undefined?{fontScale:value.fontScale}:{}), ...(value.language ? {language:value.language}:{}), tasks: value.tasks, projects: value.projects, theme: value.theme };
}

function createStore(directory, database) {
  if (database) return {
    read: async () => validateState(await database.call("readWorkspace")),
    write: value => database.call("writeWorkspace", validateState(value)),
  };
  const file = path.join(directory, 'workspace.json');
  let queue = Promise.resolve();
  return {
    async read() {
      await queue;
      try { return validateState(JSON.parse(await fs.readFile(file, 'utf8'))); }
      catch (error) { if (error.code === 'ENOENT') return initialState(); throw error; }
    },
    write(value) {
      const data = JSON.stringify(validateState(value), null, 2);
      const operation = queue.then(async () => {
        await fs.mkdir(directory, { recursive: true });
        const temp = `${file}.${randomUUID()}.tmp`;
        try { await fs.writeFile(temp, data, { mode: 0o600 }); await fs.rename(temp, file); }
        finally { await fs.rm(temp, { force: true }); }
      });
      queue = operation.catch(() => {});
      return operation;
    },
  };
}
module.exports = { createStore, validateState, initialState };
