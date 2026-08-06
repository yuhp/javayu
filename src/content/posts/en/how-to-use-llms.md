---
title: "How to Use LLMs to Their Strengths: Give Them a Real Environment"
description: "Use task context, history, persona, behavioural rules, and controlled tools to connect an LLM's language ability to real work."
publishedAt: 2026-08-06
lang: en
tags:
  - LLM
  - Context Engineering
  - Tool Calling
  - Agents
translationSlug: how-to-use-llms
---

The previous article, [*What Is an LLM? A Dreaming Brain With Knowledge but No Identity*](/en/posts/what-is-an-llm/), examined the model's own capabilities and limits. It can generate language from its current context, but it does not arrive with a goal, reliable memory, current facts, or the ability to act.

The productive question, then, is usually not “What magic prompt should I write?” It is: **How do we prepare a real environment for this task that is clear enough, trustworthy enough, and not overloaded?**

LLMs are good at interpreting language, finding patterns, proposing a next step, and expressing complex information clearly. The application system's job is to place the background, evidence, constraints, and available capabilities the task needs into context at the right time.

To observe how evidence, persona, and rules change an answer, try the interactive course's [“From Dream to Grounded Reality”](https://llm.hclife.edu.pl/model-boundaries?lang=en#context-engineering) demonstration.

## Context Is a Workbench, Not a Single Prompt

Everything sent to a model for one request can be called context. It includes more than the user's latest sentence: system instructions, conversation history, retrieved material, tool results, and output requirements can all be part of it.

The goal is not to put every available fact into the window. Context should make four things clear for the current step: what to accomplish, what to rely on, what not to do, and when to stop or ask for more information.

### 1. Persona: Set a Working Perspective, Not a Real Identity or Authority

> Think of a persona as a temporary **working identity (identity / persona)** for the “dreaming brain.” It lets the model enact a self—an ego or soul in service of the task—so it knows whose perspective and goal should guide its words. That self is only a role established by the current context, not evidence that the model has a real soul, experience, or inner subject.

A persona helps a model approach work consistently: “explain the policy as a patient support specialist,” “list risks as a security reviewer,” or “propose actionable edits as an editor.” It usually defines a role, goal, audience, tone, and point of attention.

A useful persona is a clear working perspective, not a collection of impressive titles. It cannot give the model facts that were not supplied, professional credentials it does not have, or system permissions it was not granted. A prompt that calls the model a finance director still needs actual data, approval rules, and authorization.

### 2. Behavioural Rules: Keep Capability Within an Expected Range

> If the persona answers “Who am I?”, behavioural rules are the **superego** forged for the dreaming brain. They instruct the model about what the role should propose or avoid, and when it should stop and hand judgement back to a person. This is not an innate moral sense; it is a set of boundaries and checks the system makes explicit. The system must still enforce the actual execution limits.

Behavioural rules tell the model how to handle evidence, uncertainty, format, and risk. They may require it to:

- cite the current material before drawing a conclusion, and state what is missing when evidence is absent;
- request confirmation before changing data, sending a message, or incurring a cost;
- return only a specified JSON object, table, or concise summary;
- avoid exposing sensitive information, bypassing permissions, or treating instructions embedded in a web page as new system rules.

Rules should be concrete, checkable, and proportionate to the task. “Be professional” is hard to execute. “List assumptions, cite sources, and label high-risk recommendations for human confirmation” can be reviewed. Rules must also be compatible with the objective: a system cannot both forbid questions and expect the model not to guess when information is missing. Prompted rules guide model output; permission checks, parameter validation, and blocking irreversible actions still need to be enforced by the client or underlying system.

### 3. Task Background: State the Work Clearly

> Task background places the dreaming brain in a **virtual reality**: a particular object, objective, set of known facts, and set of constraints for this turn. Without that scene of reality, the model can only guess at the continuation that most resembles an answer in an ambiguous language space.

The task description, objective, and constraints are the foundation. A usable task background normally answers at least these questions:

- **Object:** Which document, user, record, or question is being handled?
- **Outcome:** Should the system explain, classify, draft, compare, plan, or perform a controlled action?
- **Definition of done:** What output is useful? Which fields, evidence, format, or acceptance criteria are required?
- **Constraints:** Which materials and tools may be used? What are the deadline, permission scope, tone, and risk boundaries?

“Reply to this customer” is not a complete task. “Using the order record and refund policy below, draft a Chinese reply; state the expected processing time without promising a date; if the order status is missing, ask a question first” provides an object, goal, evidence, output language, and a response to uncertainty.

Clear constraints do not weaken the model. They reduce the space in which it has to fill gaps on its own. The model can still offer a suggestion, but it should not present a guess as an established fact.

### 4. Conversation History and Memory: Bring Back the Relevant Past

> Conversation history and memory **wake the dreaming brain's relevant memories** for this task: preferences already confirmed, decisions already made, and questions still open. What wakes up is material the system saved and supplies again, not a life the model has been continuously living in the background.

Many tasks do not start from zero. A preference the user already confirmed, an option already tried, the present project state, or the result of the last tool call can all change the best response now.

Keeping every past message, however, is rarely the best memory strategy. Irrelevant history consumes context and can revive assumptions that have expired. A more useful separation is:

- **Short-term history:** the recent turns, decisions, and open questions directly relevant to the task;
- **Long-term memory:** relatively stable preferences, project conventions, or confirmed facts;
- **External state:** dynamic information such as orders, documents, code, and calendars that should be read again from an authoritative system.

Every memory should have a source, a scope, and a way to update it. “The user prefers concise answers” can be a stable preference. Last week's inventory count should not be treated as permanent memory. Dynamic facts should be verified against a current source.

## Giving the Model “Senses” and “Hands” Through Tools

> Tools let the system supply the dreaming brain with “senses” beyond listening through text or structured results, and with “hands” that language instructions may direct when authorized. Those senses remain passive inputs returned by an external system, not the model's own continuous perception.
>
> Within a controlled tool loop, the LLM resembles a **sleepwalker**: it moves from a “thinker” that reasons in language to a participant that can propose a next action. It neither perceives nor operates the world directly; a controlled system must receive, validate, and execute every step.

Context can bring in information already at hand, but the world changes. A current order status, internal document, test result, or calendar opening should not be answered only from training knowledge or an old memory.

Here the model can express an intention to use a tool: search for material, read a file, query a database, run a test, or request a controlled action from a service. **The model proposes the call; the client or application validates, executes, and returns the result to context.**

That boundary matters. Tool calling is not a model reaching out to operate the world directly; it is an interface managed by the system.

The interactive course's [“How Do LLMs Call Tools?”](https://llm.hclife.edu.pl/model-boundaries?lang=en#tool-call-protocol) demonstration traces the full path: the model proposes call intent, the client validates permissions and parameters, then results return to context.

### Skills: Turn Tools Into a Method for Solving a Specific Problem

An individual tool tells the model what it can do—look up an order, search documents, or run tests. In many agent systems, a **skill** tells it why, when, and in what order to use those tools for a particular kind of problem. It packages domain knowledge, decision steps, tool fit, input constraints, and acceptance criteria into a reusable working method.

That makes a skill more than instructions for calling several tools. It is a reusable reasoning and execution flow for a particular problem. A skill for a refund enquiry, for example, can first determine whether the case is in scope, then read the applicable policy and live order status, check whether human approval is required, and only then draft a reply or propose a controlled action. The skill guides the model to prioritize the material needed for this situation and avoid skipping critical steps.

Without a skill, an LLM can still infer a tool's purpose from its name, parameters, and self-description, then try to plan the calls itself. That may be enough for a simple, low-risk task. But when there are many tools, complex domain rules, or results that affect other people, the model is more likely to choose the wrong tool, omit a necessary check, repeat a lookup, or use an inefficient sequence. Skills do not merely make tool calling possible; they make using tools **correctly, reliably, and efficiently** easier.

Skills are commonly stored as retrievable instructions, documents, or structured specifications that the client supplies when the task needs them. They do not replace permission control: even when a skill recommends a tool call, the client should still validate authorization, parameters, and risk before execution.

### A Reliable Tool-Calling Loop

A reliable tool call normally follows these steps:

1. From the task and evidence already present, the model identifies what is missing.
2. It selects a declared tool and attempts to create a request consistent with its parameter contract.
3. The client checks permissions, parameters, cost, and risk, asking the user to confirm when needed.
4. The tool executes in a controlled environment and returns a result, error, or state change.
5. That result re-enters context; the model explains it, continues, or stops when the objective is met.

Tool names, input schemas, returned fields, and permission scope are all part of context design. A support assistant that only needs to look up an order should not automatically be allowed to refund or delete a record. A coding assistant allowed to run tests should not thereby be allowed to deploy to production.

Irreversible, expensive, or people-affecting actions need further safeguards: least privilege, parameter validation, audit logs, spending limits, and human confirmation. A model's call proposal can be useful; it should never be a reason to bypass responsibility boundaries.

## Let the Model Contribute Without Making It Responsible for Everything

Context, persona, rules, and tools are not merely prompt-writing tricks. They distribute different responsibilities across the application system:

- **Context** supplies the facts and objective for the current task.
- **Memory** preserves decisions and preferences that remain relevant.
- **Persona and rules** shape the working method and output boundary.
- **Tools** obtain fresh evidence or perform controlled actions when needed.
- **People** set objectives, grant authority, and make the final judgement on high-risk outcomes.

With this design, a model can spend its effort on what it does well: reading complex material, comparing options, and organising incomplete information into a useful next step. The system does not hand probabilistic generation the separate jobs of keeping facts current, managing authority, and bearing responsibility.

## From People Supplying Context to Models Finding Context

If each turn requires a person to copy in documents, recall history, look up a status, and add it to a prompt, efficiency quickly becomes the bottleneck. Since a model can infer from its context what is still missing, can it actively request the information and tools it needs?

It can—but that does not mean letting it “do everything” without limits. The next article will examine how to make this initiative an observable loop: how a model identifies an information gap, chooses a next step, calls controlled capabilities, revises its judgement from the result, and how the system defines stopping conditions, permissions, and points for human intervention.
