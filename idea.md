# BotChart — Departmental Agent Network

**Name:** BotChart
**Subtitle:** Every department gets its own agent team.
**Hackathon track:** The Fortified Enterprise Fleet

## Product

- A web app where every company department has its own persistent operator agent.
- Employees give work to their department operator; it delegates to local worker agents and collaborates directly with peer department operators.
- There is **no company-wide root agent** receiving and delegating every task.
- The number of departments and operators is **dynamic**. It maps to the real company structure. It is never a fixed count.
- The product is the visual organizational layer above Google's agent infrastructure: company structure, agent creation, communication, permissions, and live work.

## Problem

- Generic agents do not match a company's departments, tools, permissions, or workflows.
- Separate agents are hard to discover, coordinate, update, and trust.
- Cross-department work stalls when an agent needs another team's context, approval, account, or credential.
- Agents do not know **which human** in the company can unblock them.
- Existing cloud components handle execution, identity, registries, and telemetry; they do not provide the company-specific operating model or frontend.

## Architecture

- `Department operator` is the internal architecture term.
- In the UI, use plain labels such as `Operations Agent`, `Finance Agent`, and `Legal Agent`.
- The company is a federation of department scopes.
- Each department has one persistent operator agent.
- Departments are created and removed per company. Example sets:
  - Small company: Operations, Finance, Legal.
  - Mid-size company: Operations, Finance, Legal, HR, Marketing, Support, IT.
- Each operator owns:
  - Department context and memory.
  - Local worker agents.
  - Task queue.
  - Approved tools and skills.
  - Human owners and approvers.
- Worker agents are narrow and usually created for a specific workflow.
- The department that receives a task remains responsible for it, even when other departments contribute.

### No root operator

- No global agent reads every task.
- No global agent automatically has access to every department's data.
- Cross-department work goes directly from one operator to another.
- Unknown destinations are resolved by a deterministic capability directory, not a root LLM.
- Company-wide administration is a shared control plane and human admin interface, not an agent that owns work.

### Shared non-agent control plane

- Organization and department directory.
- **Human directory: person -> role -> department -> owned resources, credentials, and approval rights.**
- Agent, skill, and tool registry.
- Capability lookup: `capability -> department operator`.
- Task and event transport.
- Policy, identity, authentication, and approval state.
- Version history and inheritance metadata.
- Telemetry, traces, cost, and run status.

### Three graphs

- **Vertical:** operator -> local workers; ownership, inheritance, delegation, escalation.
- **Horizontal:** operator <-> peer operator; tasks, artifacts, status, approvals.
- **Resource:** agents <-> tools, skills, data, credentials, and human owners.

## Communication (first-class feature)

Communication operates on two levels, like a real business.

### Level 1: Agent-to-agent

- Operators communicate like department heads in a real company.
- Chat is a surface; structured tasks are the system of record.
- Core message types:
  - `TaskRequest`
  - `TaskAccepted`
  - `StatusUpdate`
  - `ArtifactDelivered`
  - `PermissionRequest`
  - `AuthRequired`
  - `Escalation`
  - `TaskCompleted`
  - `TaskFailed`
- Requests include source, destination, objective, deadline, parent task, allowed shared context, expected result, and visibility level.
- Workers inside a department communicate only through their operator's scope. Peer departments see requests and artifacts, not internal chatter.
- Every message is visible in the UI as a readable conversation and as a typed event.

### Level 2: Agent-to-human

- Agents know **who to ask**, not only **what to ask**.
- The human directory maps each resource, credential, tool, and approval right to a specific person.
- When an agent is blocked, it routes the request to the correct human:
  - Finance tool locked -> the Finance tool owner receives the connect-account card.
  - Legal sign-off required -> the Legal approver receives the approval card.
  - Unknown owner -> the department operator asks its human department lead.
- The UI always shows: which agent is blocked, on what, and **which named person** can unblock it.
- Humans respond inside the app. Email and chat pings are notifications and deep links only.
- Agents never ask people to send passwords or secrets through chat or email.

## Configuration

- Every agent inherits a company baseline: security rules, logging, budgets, model policy, and runtime limits.
- Workers inherit department instructions, skills, tools, and memory scope from their operator.
- Children can narrow inherited access but cannot silently broaden it.
- The UI shows inherited settings, local overrides, and denied capabilities.
- Inheritance diff: shipped as **one pre-built diff view on one worker** for the demo, not a live diff engine.

## Task flow

1. An employee sends a request to their department operator.
2. The operator handles it, delegates to an existing worker, or proposes a new worker.
3. Local work stays inside the department scope.
4. When another department is needed, the operator sends a typed request to that department's operator.
5. The receiving operator chooses its own worker or tool and returns only the required result or artifact.
6. If authentication or approval is required, the task pauses and the **correct named human** receives a request.
7. The task resumes from its checkpoint after approval.
8. Every handoff, tool call, approval, side effect, and result appears in the web app.

## Memory (required, not later)

- **Memory Bank is a core requirement.** The track demands safe context across weeks of asynchronous operation.
- Each operator has persistent, department-scoped memory in Memory Bank.
- Workers get a narrowed memory scope inherited from their operator.
- Cross-department requests carry only the allowed shared context, never the full department memory.
- Fallback adapter: Firestore-backed memory with the same interface, if Memory Bank access is gated.

## Security (required, not later)

- **Model Armor is a core requirement.**
- Inline guardrails on operator and worker traffic: prompt injection, tool poisoning, and PII leaks.
- Agent Identity for zero-trust access between operators.
- Agent Gateway for routing and policy enforcement on cross-department messages.
- All guardrail blocks are visible in the activity timeline as first-class events.

## Creating an agent

- A user asks their department operator for a new agent.
- The operator interviews the user about the desired outcome, trigger, systems, collaborators, approvals, and success criteria.
- It generates an agent blueprint.
- The UI shows the parent department, inherited configuration, local changes, skills, tools, requested permissions, tests, and limits.
- A human approves the blueprint.
- The agent is created as a logical worker profile in a shared runtime.
- Proven workers can later be promoted to persistent agents or reusable company templates.

## Credentials and access

- When a tool needs a user account:
  - The run pauses.
  - The frontend shows a connect-account or approval card **to the person who owns that resource**.
  - The user completes OAuth or another controlled login flow.
  - The agent receives a scoped capability, not the raw credential.
  - The run resumes.
- When another department owns a resource, the requesting operator sends a permission request to the owning operator, which routes it to the owning human.
- Email is only a notification and deep link into the app.

## Frontend

The UI is the product. It is the highest priority workstream.

### Design principles

- The app encompasses every department and many concurrent users. Therefore clarity beats density everywhere.
- Complexity is revealed progressively, never all at once.
- The visual state of the map must always answer three questions at a glance: what is working, what is blocked, and which human is needed.
- Deterministic layout and motion. The same state always renders the same way. No wobble, no randomness.

### Navigation model

- Navigation is a first-class design problem, not a sidebar.
- **The map is home.** Every other screen is an overlay or a split panel opened from the map. The user never "leaves" the company; they zoom into part of it.
- **Semantic zoom** replaces most menu navigation:
  - Zoomed out: departments only, as clean zones.
  - Mid zoom: operators and workers appear.
  - Zoomed in: live task cards and message previews appear on edges.
- **Breadcrumb of place:** the header always shows where the user is (`Company > Marketing > Launch Agent > Task #142`). Every crumb is clickable.
- **Command palette (Cmd+K):** jump to any agent, task, person, department, or approval by typing. The palette is the universal escape hatch; the user is never lost.
- **Two-way linking:** clicking an edge on the map scrolls the timeline to that event; clicking a timeline event highlights the edge on the map.
- **Role-aware entry:** an employee lands focused on their own department; an admin lands on the full company view; a person with pending approvals lands with their approval queue surfaced.
- **Multiplayer presence:** avatars show which humans are viewing or acting in each department; approval cards show who is currently handling them, so two people do not act on the same request.
- The navigation model itself is communicated to the user: a first-run overlay teaches "zoom to explore, click to focus, Cmd+K to jump" in three steps and never appears again.

### Company Map

- The primary screen; not a generic dashboard.
- **Structured layout, not a force-directed graph.** Each department is a fixed district; the operator is the prominent node; workers sit beneath it. Deterministic positions at every scale.
- Departments appear as visual zones with one prominent operator and smaller workers beneath it.
- The map scales to any number of departments through semantic zoom.
- Vertical lines show inheritance and delegation.
- Horizontal lines animate during cross-department work.
- Different edges represent tasks, artifacts, permissions, and escalations; one accent color per edge type, everything else near-monochrome.
- **Task envelopes:** each cross-department message is a small packet that travels along its edge; opening it shows the typed message (type, objective, deadline, allowed context). The protocol is visible on screen, not buried in logs.
- **Task focus mode:** clicking a task dims the map, lights only the involved agents and edges, and shows the task's path as a breadcrumb (Marketing -> Finance -> Legal -> done).
- **Replay scrubber:** a timeline scrubber replays any completed task across the map — edges light in sequence, the pause appears, the approval lands, the run resumes. Weeks of asynchronous work replay in seconds.
- **Ambient status motion:** idle agents breathe slowly; working agents pulse; blocked agents are static with a lock badge; guardrail blocks flash briefly at the Gateway.
- Blocked work shows a lock badge with the avatar and name of the human who can unblock it, drawn as a dotted edge from agent to person.
- Clicking an agent opens its configuration, tools, skills, queue, owner, cost, status, and recent runs.
- Theme: light enterprise default; dark "mission control" mode for demos and recording.

### Voice and multimodal

- Voice input to a department operator: the user speaks a request ("ask Finance for the Q3 launch budget") and the map animates the resulting cross-department work.
- One targeted feature, not a voice-first app. It strengthens the enterprise "talk to your company" appeal and targets the Best Multimodal UX prize.
- Voice is an input surface only; the typed task protocol remains the system of record.

### Department Workspace

- Department operator chat.
- Local workers and queue.
- Connected tools and data.
- Incoming requests from other departments.

### Agent Room

- Conversation plus a structured execution timeline.
- Plans, handoffs, approvals, tool calls, artifacts, and completed actions appear as expandable cards.

### Work and Approvals

- Cross-department requests.
- Access and authentication requests, routed to named people.
- Human decisions.
- Failed or blocked work.

### Activity

- Live and historical runs, side effects, handoffs, errors, guardrail blocks, latency, cost, and links to full Google traces.

## Google integration

### Use Google for

- Gemini 3.5 and ADK reasoning/orchestration.
- A2A communication between operators.
- Agent Runtime or Cloud Run execution.
- Agent Registry and Skill Registry.
- **Memory Bank for persistent cross-session context.**
- Agent Identity and Auth Manager.
- Agent Gateway.
- **Model Armor guardrails.**
- OpenTelemetry and Google agent observability.
- Pub/Sub for asynchronous events.
- Firestore or PostgreSQL for product state.

### Build ourselves

- The web app and company map.
- Company, department, agent, and human ownership model.
- Human directory and blocked-work routing.
- Department operator behavior and worker blueprints.
- Configuration inheritance model.
- Typed cross-department task protocol.
- Human approval and credential UX.
- Business-level activity timeline.

### Integration rule

- Put Google services behind adapters.
- Use the real component when project access and stability allow it.
- Keep a Cloud Run and product-database fallback for every critical demo path.
- Do not let a gated or preview API block the end-to-end demo.
- The demo video must show the backend running on Google Cloud (console, Cloud Run dashboard, or Vertex AI logs).

## Hackathon demo

- Synthetic mid-size company with a realistic department set: Operations, Finance, Legal, HR, Marketing, and Support (five to seven operators; the count is a company property, not a product limit).
- Scenario: product launch.
  1. A Marketing employee asks the Marketing Operator to create a Launch Agent.
  2. The operator interviews the employee and generates a blueprint; a human approves it; the worker appears under Marketing on the company map.
  3. A launch brief triggers the worker.
  4. It asks Finance for a budget confirmation, Legal for a claims/policy check, and Support for FAQ preparation.
  5. Finance requires a connected account; the run pauses; **the map shows the named Finance tool owner who must act**.
  6. That person approves in the app; the run resumes from its checkpoint.
  7. The worker creates a Drive folder, updates a Sheet, and sends an internal summary.
  8. The map and timeline show multiple animated cross-department edges, the guardrail layer, and real side effects.

## MVP

### Required

- Dynamic department model; demo configured with five to seven operators.
- One shared configurable worker runtime.
- Live company map and task edges at demo scale.
- Two-level communication: typed operator-to-operator protocol and human-routed unblock requests.
- Request-an-agent interview and blueprint approval.
- One direct operator-to-operator task with a returned artifact.
- One human approval or OAuth pause/resume, routed to a named person.
- **Memory Bank (or its Firestore fallback adapter) for operator memory.**
- **Model Armor guardrails on agent traffic, with visible blocked events.**
- One real Google Workspace side effect.
- One pre-built inheritance diff view.
- Semantic zoom, task focus mode, and the replay scrubber on the company map.
- Split view: map on the left, selected Agent Room on the right, with two-way linking.
- Command palette navigation (Cmd+K).
- Voice input to one department operator (Best Multimodal UX target).
- Persistent state, idempotent actions, and readable traces.

### Later (only if time remains)

- Agent and Skill Library: browse, fork a blueprint, pull parent updates, promote a proven agent or skill.
- Automatic company discovery.
- Gateway policy UI.
- Managed Agents API experiments.
- Browser computer use and human takeover.
- More departments and workflows.

### Do not build for the hackathon

- A central root operator.
- A full Git implementation.
- A custom agent hosting platform or OAuth vault.
- Dozens of integrations.
- A graph database solely for the visualization.
- Arbitrary agent-generated code execution.
- Automatic access expansion without human approval.

## Build order

1. Lock the department, agent, human-directory, task, approval, artifact, and event schemas.
2. Build the polished frontend with deterministic simulated events.
3. Implement one department operator and the shared worker runtime.
4. Add the remaining operators from the demo company configuration.
5. Implement operator-to-operator requests and returned artifacts.
6. Wire Memory Bank (or fallback adapter) and Model Armor.
7. Add one real Google Workspace action.
8. Implement pause, human-routed approval or OAuth, checkpoint, and resume.
9. Replace simulated events with live backend events.
10. Add only the Google platform integrations that improve the visible demo.
11. Freeze backend scope and spend the remaining time on polish, reliability, and rehearsal.

## Submission and bonus points

- Submit: category, hosted URL, text description, repo with spin-up instructions, architecture diagram, and a ~4-minute demo video with Google Cloud proof on screen.
- **Bonus content plan:**
  - Publish one public build write-up (blog or video) that states it was created for this hackathon.
  - Publish one social post on X or LinkedIn with the hashtag `#AllThingsAgenticHackathon`.
  - Budget one to two hours near the end for both.

## Differentiation

- The novelty is not merely "one bot per department."
- The product combines:
  - Federated department operators with no root orchestrator.
  - A dynamic company model: as many operators as the company has departments.
  - Direct, governed cross-department work.
  - Two-level communication: agents talk to agents like department heads, and agents know which named human can unblock them.
  - Agent creation through an interview and visible blueprint.
  - Persistent department memory with scoped sharing (Memory Bank).
  - Inline guardrails as visible product events (Model Armor).
  - Human-centered authentication and permission handling.
  - A polished live company map with semantic zoom, focus mode, and task replay.
  - Intent-driven UI: every component earns its place, and the map itself is the navigation.
  - Voice input as a natural enterprise surface: speak to your company, watch it work.
  - Google enterprise agent infrastructure under a custom organizational control plane.

## Name

- **BotChart** — the graph-first interface is the identity of the product.
- Subtitle: `Every department gets its own agent team.`
