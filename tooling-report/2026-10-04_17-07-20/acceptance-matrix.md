# T01–T22 验收

20 PASS、2 BLOCKED-HOST；不是“全部通过”。详见 [原始桌面结果](evidence/desktop/report.json)、[机器明细](cases.json)。

|ID|用例|状态|证据|
|---|---|---|---|
|T01|SDK 出包|PASS|packages.log：仓库外、空缓存、真实 tarball 离线安装，Schema require + CJS/ESM + 严格 TypeScript|
|T02|脚手架与归档|PASS|packages.log：五模板 init/build/validate/pack；桌面安装 clean-install archive|
|T03|AST/路径规则|PASS|unit.log：宿主 AST/路径/符号链接/跨 Skill ID 差异测试|
|T04|严格校验|PASS|unit.log：严格 YAML、限制、映射/类型/恢复/结果引用负例；CLI 诊断 code/file/form/step/hint|
|T05|默认权限发现|PASS|desktop/report.json 对应 ID|
|T06|字段确定性|PASS|unit.log 的非法日期/范围/选项/整数/金额负例，结合桌面金额精度和必选确认|
|T07|自动保存|PASS|desktop/report.json 对应 ID|
|T08|切换与重启|PASS|desktop/report.json 对应 ID|
|T09|多步骤身份|PASS|desktop/report.json 对应 ID|
|T10|回退修改|PASS|desktop/report.json 对应 ID|
|T11|写确认取消|PASS|desktop/report.json 对应 ID|
|T12|写入成功|PASS|desktop/report.json 对应 ID|
|T13|响应丢失|PASS|desktop/report.json 对应 ID|
|T14|明确未执行|PASS|desktop/report.json 对应 ID|
|T15|结果仍未知|PASS|desktop/report.json 对应 ID|
|T16|恢复契约|PASS|desktop/report.json 对应 ID|
|T17|服务幂等|PASS|service.log：原子持久化、同键同输入、异输入冲突、新键不重复报销、持久取消屏障|
|T18|多窗口冲突|PASS|desktop/report.json 对应 ID|
|T19|权限与归属|BLOCKED-HOST|desktop/report.json 对应 ID|
|T20|来源/生命周期|PASS|desktop/report.json 对应 ID|
|T21|常规 Operation 兼容|BLOCKED-HOST|desktop/report.json 对应 ID|
|T22|已有功能回归|PASS|unit.log 65/65；host-unit.log 201/201，包括消息、设置、认证、首页桥、MCP Apps。旧版桌面全矩阵未重跑，未宣称新增认证能力。|
