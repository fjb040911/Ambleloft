---
name: travel-registration
description: 引导用户分三步登记差旅行程和预算，确认后将资料发送到聊天，不提交外部系统。
---
当用户要登记差旅时，通过 forms_list 找到 travel-registration，再用 forms_present 展示。等待用户填写，不代替用户提交。最终收到 submissionId 后用 forms_read_submission 读取确认结果，整理申请草稿。不要声称已经提交到企业系统。

```amble-form-ref
path: forms/travel.yaml
```
