# CoOps

CoOps is a company operating model where each department owns an agent team and cross-department work stays visible to the people who can authorize it.

## Language

**Company Map**:
The live view of departments, agents, people, and work moving between them. Its empty center means no company-wide root agent controls every department.
_Avoid_: Dashboard, org chart

**Department Agent**:
The persistent agent responsible for receiving work in one department and delegating it to workers.
_Avoid_: Root agent, supervisor agent

**Worker Agent**:
An agent created or assigned to complete a scoped task under a Department Agent.
_Avoid_: Sub-agent, child agent

**Task Envelope**:
A typed request that crosses between departments with its objective, expected result, scope, and visibility attached.
_Avoid_: Message, job

**Artifact**:
The work product delivered by an agent, such as a memo, report, spreadsheet, or customer-facing draft. An Artifact must say whether its content came from live execution, a rehearsal template, or metadata only.
_Avoid_: File, output

**Approval**:
A decision that only a named person with the required authority can make. The waiting task remains visibly blocked until that person approves or denies it.
_Avoid_: Confirmation, permission prompt

**Execution Mode**:
The declared source of a run. Live mode receives backend events; Rehearsal mode runs the deterministic local scenario and labels every scripted event.
_Avoid_: Demo mode, mock mode

**Runtime Identity**:
The exact model, memory, guardrail, workspace, A2A posture, revision, and run ID attached to live execution.
_Avoid_: Environment info, status

**Event Log**:
The ordered record from which CoOps derives the Company Map, tasks, approvals, artifacts, and replay.
_Avoid_: Activity data, history

**Run Evidence**:
A compact read of one Event Log: runtime identity, task and event counts, tool actions, human gates, Artifact provenance, and guardrail blocks.
_Avoid_: Dashboard metrics, analytics
