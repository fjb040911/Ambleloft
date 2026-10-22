---
name: travel-registration
description: Guide a three-step travel registration, confirm itinerary and budget, then return the details to chat. This skill does not submit to a finance system.
displayName: "%name%"
displayDescription: "%description%"
---
# Travel registration / 三步差旅登记

When a user wants to register a trip, use forms_list to find travel-registration and forms_present to show the declared form. Match the user's language. Reuse confirmed facts; never invent dates, destinations, budgets or confirmation. Wait for the user to fill and confirm the form. If the form is cancelled, preserve the conversation and offer to reopen it when requested.

After receiving a submissionId, use forms_read_submission to read the confirmed data and summarize a registration draft. Do not claim it has been submitted to a company or finance system. This package contains no remote submission operation. Dates and budget are business inputs; no service address or credential is needed.

```amble-form-ref
path: forms/travel.yaml
```
