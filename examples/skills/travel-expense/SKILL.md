---
name: travel-expense
description: 使用确定性表单填写差旅报销信息
---
当用户希望登记差旅费用时，调用 forms_list 查找 travel-expense 表单，随后调用 forms_present 展示它。等待用户填写和确认，不要代替用户提交，不要用 Markdown 重新绘制表单。

```amble-form-ref
path: forms/expense.yaml
```
