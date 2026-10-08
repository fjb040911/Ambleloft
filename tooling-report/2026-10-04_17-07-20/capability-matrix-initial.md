# v0.3.0 初始能力对照

|需求|宿主入口|SDK/CLI 初始状态|本轮目标|
|---|---|---|---|
|F01–04|forms/service → OperationRouter → bootstrap|缺少 form 类型|同步可选上下文和恢复类型；不新增 RPC|
|F05|contracts/form.schema.json|未出包|原样出包及 tarball 验证|
|F06–08|forms/template.cjs、service.catalog|无表单检查|复用 AST/YAML 解析，加业务静态诊断|
|F09、D01–03|扩展 skills、page Operations|无报销案例|三步报销模板及独立持久化服务|
|F10|现有宿主入口|无能力协商|记录指纹与限制|
|T01–22|机器测试及真实 Electron|本轮未执行|逐项保留状态和证据|
