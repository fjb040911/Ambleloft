# Progressive interaction design

The goal is to advance the user's task with less effort and waiting. Travel is one example; use the same reasoning for learning plans, purchases, writing and technical troubleshooting. Do not impose a universal sequence of fields.

## Decide what to ask next

Maintain a compact working distinction between:

- Confirmed facts: user statements and submitted answers, with the request/message that supplied them.
- Open questions: the decision each answer changes and the next action it unlocks.
- Suggestions: useful defaults the user has not yet accepted.
- Work products: which facts and assumptions each result depends on.

This is task reasoning, not a new host API or a required user-facing planning table. Prefer questions that unlock substantial useful work, reduce consequential uncertainty, and are easy to answer. Delay refinements that do not affect the next action. Group related questions only when batching saves effort without delaying an earlier useful action. Stop collecting once there is enough to produce a useful draft.

Do not ask the user again for a clear answer already in the conversation. Clarify ambiguous roles: “Shanghai” could mean departure city or destination. An uncertain answer is valid information, not a reason to force an exact date or budget. If the user asks for destination recommendations, ask the constraints needed to recommend; do not force them to choose a destination first.

## Choose controls within actual capabilities

- Use `select` for a small, meaningful set of mutually exclusive answers. Keep labels understandable and options non-overlapping. Include “not sure / recommend for me” when useful. Use separate checkboxes for independent preferences when multiple selections matter.
- Use free text for genuinely open answers. A city search, autocomplete, chip picker and multi-select are not exposed by the current dynamic input contract; do not invent them.
- Keep exact date, numeric budget and other precision optional until the next action genuinely requires it. Use coarse choices or a short text answer where the user may not know the exact value.
- Prefer showing a recommendation in help/description. If prefilled, label it explicitly as suggested and never silently treat it as user evidence. Do not supply arbitrary destination, budget or dates just to make a form look complete.
- Put why this question matters in a brief reason; use human labels rather than internal field names. Avoid decorative fields and long lists of speculative options.
- Current dynamic forms are single-page, with no `visibleWhen`, dependent fields, hidden fields, scripts or operations. Adapt across requests after confirmed answers; do not simulate conditional layout with unsupported schema properties. Limits are ceilings, not target form sizes.

## Interleave questions and useful work

`input_request` persists and returns immediately. Start available work that depends only on confirmed inputs. For example, after a destination is confirmed, collect a small set of candidate attractions while asking about preferences. Avoid generating complete itineraries for every possible answer. Search only if the task requires it and a real search tool is available; requesting input does not start background research itself.

On a host-delivered answer or subsequent user message, read the confirmed answer and apply it to the work in progress. A pending request and its unsubmitted draft are not evidence. Do not poll. If nothing independent can usefully proceed, explain what is needed and end the turn; the pending request remains.

`executionUnitResume:0` does not provide a dependency scheduler or guarantee simultaneous tool execution. Work may be interleaved in the current execution context or continued on a later input turn. Never promise independently running workers or automatic cancellation that the host does not support.

## React to changed answers

If a destination changes from Shanghai to Hangzhou, stop relying on Shanghai candidate results, route calculations and assumptions about travel time. Retain genuinely reusable preferences, such as a relaxed pace. An in-flight result based on the old destination must not enter the final answer as if it matched the new one. Where tools support cancellation, cancel obsolete work; otherwise disregard its stale result.

Review existing pending questions once. Cancel ones that are no longer relevant; replace only when their meaning must change. Follow the lifecycle reference for revision checks and draft protection. Do not rewrite completed snapshots, silently overwrite an edited form, or treat a replacement proposal as accepted. Reconsider subsequent questions using the new information rather than restarting the entire questionnaire.

## Examples and acceptance

| Task | Early information | Useful work unlocked | Later refinement |
|---|---|---|---|
| Trip planning | Destination, or constraints for recommending one | Candidate places and geography | Interests, duration, dates; exact dates earlier if availability drives the task |
| Learning plan | Target outcome and current level | Skill gaps and a draft learning sequence | Time available, preferred format, pace |
| Product selection | Intended use and hard constraints | Candidate categories and trade-offs | Soft preferences; price/location before market-dependent recommendations |
| Writing | Audience and intended outcome | Outline and main arguments | Tone, length and examples |

For travel after a confirmed destination, `../examples/travel-preferences.json` is a valid small follow-up, not a fixed recipe. Replace its demonstration requestKey for a new real question; keep the key/payload on retries. Adapt choices to the task. The initial travel.json permits submission without an exact date; when the destination alone unlocks work, ask it directly rather than copying the example mechanically.

Evaluate actual behavior: Does the first question unlock useful work? Does the agent use information already given? Can the user stay uncertain? Does available work really proceed before all answers arrive? Does the next answer change the output? Are stale results excluded after a correction? Are all displayed controls supported? These are qualitative criteria, not guarantees established by schema validation or deterministic tests.
