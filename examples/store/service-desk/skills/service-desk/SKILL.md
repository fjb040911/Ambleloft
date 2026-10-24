---
name: service-desk
description: Open a three-step equipment issue form and submit to a test service only after user confirmation. Query real ticket IDs and recover uncertain outcomes.
displayName: "%name%"
displayDescription: "%description%"
---
# Equipment service desk / 设备售后工单（测试）

When asked to report a device fault, use forms_list to locate this skill's ticket form, then forms_present. Respond in the user's language. Reuse known facts; never fabricate equipment, faults or contacts. Use fictional test data.

The form collects equipment and issue, priority and contact, then confirmation. The host asks for confirmation and invokes the write operation. Never bypass the form by calling the write operation directly. Service URLs, toolchain paths and credentials belong in extension settings, not business forms or chat. A local SSH tunnel must be available in the test environment.

For an uncertain result use the declared lookupTicket recovery operation and the same submissionId. A timeout is not proof of failure; do not create a duplicate ticket. Report success only after receiving a real ticketId. getTicket queries the existing result. The lifecycle supports received, processing, awaiting_customer, resolved and closed. Read actual status; never invent progress. Customers can open this extension’s page to refresh progress, send requested text, report that the issue remains, or confirm resolution and close. Operators use the same page under their separate test identity. Server authorization, revision checks and operation confirmation govern changes. A chat pause never cancels accepted server work. Credentials are entered through the extension page’s secure test-credential dialog, never in chat. If settings or the tunnel are missing, explain the blocker without pretending the ticket was sent.

```amble-form-ref
path: forms/ticket.yaml
```
