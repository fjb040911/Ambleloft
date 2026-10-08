# 声明式业务表单开发指南

状态：当前源码的开发者预览。基础 DSL 和宿主链路已实现，公开 API 尚未稳定；不代表旧版安装包包含全部功能。

## 选择实现方式

- **声明式表单**：Skill 描述业务入口，YAML 定义确定的字段和步骤，宿主使用 shadcn/ui 绘制，Node 后端执行业务操作。
- **MCP Apps**：扩展自己提供 HTML/JS，在隔离的任务内容器运行；参见 [MCP Apps 支持范围](mcp-apps-design.md)。不强制使用宿主组件。
- **扩展首页**：从扩展列表进入的独立操作页面，沿用首页桥；不等同于聊天内表单。

业务 API 地址放在扩展配置中，由扩展 Node 后端访问。Skill 和 YAML 不携带认证凭据，不直接声明任意 HTTP 提交地址。

## 定义和发现

在 extension.json 的 skills 中注册 Skill 目录，在该目录的 SKILL.md 中加入根级代码块：

````markdown
当用户需要登记费用时，先调用 forms_list 选择本扩展模板，再调用 forms_present 展示，等待用户填写和确认。

```amble-form-ref
path: forms/expense.yaml
```
````

path 相对当前 Skill 目录，不能越界或通过符号链接引用文件。也可以使用 amble-form 代码块直接包含 YAML。引用、列表内的嵌套示例不注册为模板。

以下最小模板把填写结果发送到当前聊天：

```yaml
version: 1
id: expense
title: 费用登记
fields:
  - name: region
    type: select
    label: 地区
    required: true
    options:
      - label: 上海
        value: shanghai
      - label: 北京
        value: beijing
  - name: amount
    type: money
    label: 金额
    required: true
    currency: CNY
    minimum: "0.01"
submit:
  kind: chat
  label: 发送到当前聊天
```

可直接导入的示例：[差旅 Skill](../../examples/skills/travel-expense/SKILL.md)。它用于信息收集，发送到聊天不表示已经向报销服务提交。

## 接入业务服务

完整业务扩展在 manifest.operations 注册后端 handler，然后用 submit.kind=operation 或步骤 next.kind=operation 引用它。操作必须属于当前扩展，exposeTo 包含 page；写操作必须声明 recovery.operation。

```yaml
submit:
  kind: operation
  label: 提交报销
  operation: example.expense.submit
  input:
    region:
      from: steps.main.region
    amount:
      from: steps.main.amount
  recovery:
    operation: example.expense.lookupSubmission
```

此片段替换上面的 submit，且需自行声明并实现两个 Operation。projectScoped=true 的操作还需要将 projectId 映射到 context.projectId，并获得对应资源授权。

用户点击提交后，宿主校验模板、字段、权限和操作参数，再调用扩展。写入确认不会因“表单已展示”或已有记住的确认而自动跳过。扩展调用业务服务并返回符合 outputSchema 的结果。

## 提交身份与错误

业务提交的 InvocationContext.form 包含 flowInstanceId、stepId、submissionId、templateDigest、conversationId。它由宿主注入；普通 Operation 的 form 可以是 undefined。专用 handler 应在写入前检查 form，缺失时可抛 `Object.assign(new Error('Form required'), {code: 'UNSUPPORTED'})`。

服务端按 submissionId 以及真实租户/用户、操作范围记录和去重；requestId 不能代替 submissionId。这些标识不是业务认证凭据，SDK 也不能替代服务端幂等保证。

公开 code 按宿主白名单返回；未知异常为 INTERNAL，不透传异常 message、stack、输入和凭据。effectStatus 由宿主实际调度状态决定：后端抛出 FORBIDDEN、UNSUPPORTED 或 CANCELLED 也不证明没有发生副作用。不得根据异常码自动重试业务写入。

## 核实未知结果

恢复 Operation 必须同扩展、只读且向 page 暴露。查询输入为 submissionId，projectScoped 时还包含 projectId；查询调用不携带 context.form。

返回值为以下三种对象之一：

- `{status: 'succeeded', result: 原操作结果}`：宿主再次按原 outputSchema 校验。
- `{status: 'notExecuted'}`：服务能证明没有执行，且旧请求不会继续产生副作用。
- `{status: 'unknown'}`：仍无法判定，继续保留待核实状态。

超时、断线、查不到记录或取消等待都不能直接解释为 notExecuted。宿主不自动重放未知提交，服务端也应防止已提交业务被新提交 ID 再次创建。

## 多步骤与边界

用 steps 替代根 fields；字段简写的隐含步骤 ID 为 main。from 支持 steps.<step>.<field>、前置 results.<step>.<顶层结果字段>、context.projectId。纯导航省略 next；中间保存使用 Operation，chat 仅用于最终提交。

草稿持久化并带修订号，自动保存不阻止继续输入。回退修改前置字段会清理下游结果和必要确认，但不会撤销服务端已经完成的业务。模板或来源版本变化后旧实例不能继续执行，尚未提供旧模板迁移 API。

支持 text、textarea、number、money、date、select、checkbox；最多 20 步、累计 100 字段、YAML 128 KiB。金额为十进制字符串，日期为有效 YYYY-MM-DD。结构见 [Schema](contracts/form.schema.json)，完整设计目标见 [设计文档](declarative-forms-design.md)。

动态选项、复杂分支、附件、密码字段、模板自动本地化、forms_resume 和 SDK 直接展示表单的方法尚未实现。不要将配置表单、MCP Apps 或 manifest 本地化的能力推断为本 DSL 的能力。

## 构建与验证

宿主验证命令：

```sh
npm run build
npm test
npm run test:forms
```

test:forms 包含真实 Electron 和本机模型协议 fixture，需要桌面环境及本机回环端口；不连接真实企业服务。

本仓库 packages/extension-sdk 是本地参考预览包，不代表独立 SDK/CLI 的最新发行版本。本地构建脚本已把 form.schema.json 加入 SDK 出包；使用独立工具库时，应检查实际 tarball 的类型、Schema exports 和宿主兼容记录，不能仅依赖版本名称。
