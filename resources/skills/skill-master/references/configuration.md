# 环境配置与创建引导

创建时确认“做什么、使用哪一类工具、在哪里运行”。安装后在“设置 → 扩展 → 对应扩展 → 设置”填写“连接哪台设备、工具装在哪里”。这些设置可重复修改，不应要求用户重新创建扩展。

例如 FPGA 调试助手：创建时确认使用现有 GDB Server 还是厂商调试工具、目标平台及只读/运行控制范围。设备地址、GDB 可执行文件路径是设置项；每次调试的目标文件、断点或查看范围才是业务输入。密码、令牌不属于普通配置，走宿主安全凭据能力。

## 当前宿主支持的声明

manifest 中的 `configuration` 使用随附 extension.schema.json 的 valueSchema 子集。例如以下片段应并入完整 manifest：

```json
{
  "permissions": [{"capability":"configuration","scope":"self"}],
  "configuration": {
    "type":"object",
    "description":"连接真实设备前填写。暂未配置时仍可安装和查看模拟示例。",
    "properties": {
      "debugServer":{"type":"string","description":"GDB Server 地址，例如调试主机及其端口。由用户在安装后填写。","maxLength":512},
      "gdbPath":{"type":"string","description":"运行扩展的机器上 GDB 可执行文件的路径。留空时只尝试从 PATH 查找。","maxLength":4096}
    },
    "additionalProperties":false
  }
}
```

当前配置 Schema 没有 `default`、`title`、`format`、`scope` 或文件选择器声明；不能照搬 VS Code 的字段。使用清晰的 description，普通字符串由宿主提供输入框、枚举提供选择框、布尔项提供开关。当前设置按扩展保存，并非自动按项目覆盖。多项目参数需依据真实业务另行设计。

不要把尚未提供的环境参数加入 schema.required 来阻塞安装后的基础设置保存。由实际连接操作验证所需值，并返回明确缺项提示。只有确有合理默认行为时在代码中提供默认值；不得假设设备地址、偷偷扫描网络或安装工具。

## 运行与验证

`context.configuration.get()` 读取已保存的值，`context.configuration.onDidChange()` 订阅更改，实际类型见 contracts.d.ts。注册操作时不强制打开设备连接。配置权限尚未授予、值缺失或工具不存在时，安装和静态说明仍应可用；连接操作给出可恢复的设置提示。

配置更改后，下次操作读取新值；持续会话应明确何时重新连接，不能在修改地址后继续把写入发送到旧设备。进程调用使用参数数组；路径或地址不能拼接成未经约束的 shell 命令。首次连接验证使用只读检查，真实下载、运行或修改硬件需要相应授权。

至少验证：空配置可安装；缺项操作提示设置；保存并重启后仍保留；修改配置被后端采用；无效路径或连接失败可修正后重试。模拟通过与实机通过分别记录。
