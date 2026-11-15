# QuickK

Cmd+K for quick AI work in VS Code and Cursor: edit, generate, ask, and write terminal commands without an agent or chat panel.

## Language

**Setup**:
The user's path from "QuickK not installed" to the First Edit.
_Avoid_: Activation (VS Code's word for an extension starting), onboarding, connect

**First Edit**:
The first time a user accepts a change made with `Cmd+K`. Setup is done when this happens.
_Avoid_: First use, first run

**Usage log**:
The record of QuickK's own API calls, kept on this machine.
_Avoid_: Dashboard, history, monitoring

**Price list**:
The model prices shipped with QuickK. They turn token counts into an estimated cost.
_Avoid_: Billing, tariff, rate card

**Estimated cost**:
The figure stored on a usage entry when the call is recorded, from the price list and that call's token counts. Later price lists leave it as it is.
_Avoid_: Bill, invoice, spend, actual cost

**Usage view**:
The read-only editor tab the user opens with **QuickK: Show Usage**. It opens only when they ask for it.
_Avoid_: Dashboard, panel

**Usage entry**:
One QuickK API call in the usage log. It holds the time, the model, the API address, the task kind, the input and output token counts, and the estimated cost when the price list has a price for that call.
_Avoid_: Request, row, event

**API address**:
The provider URL the user set for QuickK.
_Avoid_: Base URL, endpoint, host

**Task kind**:
Which QuickK action a call was: edit, generate, question, or terminal.
_Avoid_: Mode, operation, feature
