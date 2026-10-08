# 任务内差旅表单演示

这是可直接加载的开发目录，不依赖 SDK 包构建。后台使用宿主注入的 Extension context，页面使用标准 MCP Apps postMessage 协议。

1. 开发版 Amblelost → 设置 → 扩展 → 加载开发目录，选择本目录并信任。
2. 为此扩展授权 storage 私有存储权限（用于保存按钮）。
3. 新建任务，输入“用差旅表单演示填写去上海的差旅记录，金额 1200 元”。
4. Agent 调用 `example.task-form.render`，任务出现“差旅记录”卡片。
5. 打开卡片，修改地点和金额，点击“保存到本地记录”；在 Amblelost 确认窗确认或取消。

render 是只读、Agent 可用；save 只供页面调用，是写操作，声明 storage 权限并且需要确认。没有财务服务或付款行为。保存使用扩展存储的 revision 比较避免覆盖并发修改；业务产品仍需实现业务幂等、结果查询与记录列表。

HTML 为单文件。无需使用 window.ambleExtension 或 window.openai；其他 MCP Apps 宿主若将同名工具和资源暴露，也可以复用此页面协议。完整 Extension 包不能直接视为通用 MCP Server。

页面重新打开接收原工具快照，不会自动重新保存。示例文案为中文；生产扩展请按宿主 locale 选择翻译，manifest 展示字段可用 `%key%`。
