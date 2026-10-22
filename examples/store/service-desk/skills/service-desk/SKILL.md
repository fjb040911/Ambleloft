---
name: service-desk
description: Open a three-step equipment issue form and submit to a test service only after user confirmation. Query real ticket IDs and recover uncertain outcomes.
displayName: "%name%"
displayDescription: "%description%"
---
# Equipment service desk / 设备售后工单（测试）

When asked to report a device fault, use forms_list to locate this skill's ticket form, then forms_present. Respond in the user's language. Reuse known facts; never fabricate equipment, faults or contacts. Use fictional test data.

The form collects equipment and issue, priority and contact, then confirmation. The host asks for confirmation and invokes the write operation. Never bypass the form by calling the write operation directly. Service URLs, toolchain paths and credentials belong in extension settings, not business forms or chat. A local SSH tunnel must be available in the test environment.

For an uncertain result use the declared lookupTicket recovery operation and the same submissionId. A timeout is not proof of failure; do not create a duplicate ticket. Report success only after receiving a real ticketId. getTicket queries the existing result. This test API only implements received; do not invent assignment or repair status. If settings or the tunnel are missing, explain the blocker without pretending the ticket was sent.

```amble-form-ref
path: forms/ticket.yaml
```
