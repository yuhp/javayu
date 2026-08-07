---
title: "How LLM Initiative Works: From Language Intent to Controlled Execution"
description: "Initiative comes from the model's mathematical computation: it generates content directly or requests supplemental content; a client recognises the structure, controls execution, and returns results."
publishedAt: 2026-08-06T12:30:00+08:00
lang: en
tags:
  - LLM
  - Agents
  - Skills
  - Tool Calling
translationSlug: how-llms-become-proactive
---

The previous article, [*How to Use LLMs to Their Strengths: Give Them a Real Environment*](/en/posts/how-to-use-llms/), explained how context, skills, and tools let a model participate in real work. The next question is: if a model itself only generates language, why can it appear to answer proactively, select a skill, call a tool, and move a task forward?

Apparent initiative is not a model suddenly acquiring an independent will. It is a chain made jointly by model computation and system runtime: **people place goals and descriptions of skills and tools in context; the model computes a probability distribution for the next output and produces one under a decoding policy; it either produces content directly or requests supplemental content; the client recognises its structure, controls execution, and returns results as fresh context to the model.**

## Initiative Has Two Layers: Generation and Meaning

> Using the metaphor of an id, an LLM's internal “id” is not desire, motivation, or a continuously existing self. It is the generation mechanism that computes probabilities for the next token from the current context. People write a role, objective, and working method into that context, supplying an external direction for action; the model then enacts that direction through mathematical computation. It may display initiative, but it does not set its own life goals or keep acting in the background.

This initiative can be understood at two layers. The **generation layer** explains how content is computed token by token. The **semantic layer** explains why that content does more than continue the final sentence: under task instructions, it can become the next move that adds context and advances an objective. These are two ways to observe the same model computation, not two separate “agents” inside the model.

### 1. Generation-Layer Initiative: Mathematical Computation Produces Language

Let the current context be $C$, and let the tokens already generated be $y_{<t}$. At step $t$, a model with parameters $\theta$ computes a hidden state and a probability for every candidate token in its vocabulary:

$$
h_t = f_\theta(C, y_{<t}), \qquad p_\theta(v \mid C, y_{<t}) = \operatorname{softmax}(W h_t)
$$

Here $v$ is a candidate token. A decoder then samples from this distribution or selects a token under a chosen policy, producing $y_t$. The new $y_t$ is added to context, and the same computation repeats. Ordinary prose, a clarifying question, fields in JSON, a tool name, and tool arguments are all generated token by token in this way.

Ending is part of this mechanism too. Many model vocabularies include an end-of-sequence token (EOS). When it receives sufficient probability in the current context and is selected, the serving system can end that model response.

More precisely, the model does not first understand “I have said enough” and then make a decision; it assigns a probability to an end token under the current context. At the same time, an API's maximum-output length, client-configured stop strings, timeout, or user interruption can end generation without an EOS. `Those are runtime rules, not the model's own judgement.`

> That is why a vague “take care of this for me” does not automatically produce reliable action. If context does not state the task goal, current state, and available capabilities, the model still computes and produces a `plausible continuation`, but it lacks the conditions needed for that continuation to reliably correspond to a real task.

### 2. Semantic-Layer Initiative: Content Advances a Task Under Instructions

The generation layer explains *how* output appears, but not yet *why* that content may add missing context. Context contains more than preceding prose: it can include the task object, objective, definition of done, behavioural rules, and available capabilities. Together, these establish the semantic direction of the current language: what counts as complete, what evidence is still absent, and which next moves are permitted.

Suppose the instruction is, “Reply accurately to the customer using the current refund policy and order status,” but no order status is present. Inventing a final reply would not be a good semantic continuation of that task. A continuation better aligned with the current context may ask a clarifying question, request the refund-enquiry skill, or generate a candidate order-lookup instruction.

The initiative here is in the **semantic function of the content**: the model does not merely produce a sentence, but enacts the next step implied by the instruction and attempts to supply the context needed to complete the task.

> This does not mean the model independently discovers an objectively real “information gap,” verifies that gap, or has authority to fill it. From the task requirements expressed in language, available evidence, and capability descriptions, it merely computes that an output such as “obtain this first” better fits than “conclude now.”

The client still retrieves skills, queries tools, validates results, and sends those results back. Semantic-layer initiative is therefore not a second mysterious capability. It is generation-layer token-probability computation producing language with a task-advancing function under the constraints of an instruction.

## How Initiative Advances a Task: Answering or Requesting Additional Context

From a client's perspective, this semantic task advancement has only two basic forms: generating content directly or requesting supplemental content:

1. **Generate content directly.** From existing context, the model writes an answer, explanation, plan, or deliverable. Content itself is the most basic and common proactive output.
2. **Request supplemental content.** When existing context is insufficient to continue reliably, the model can ask a clarifying question, request relevant skill instructions, or generate a candidate call to query a tool. Their shared purpose is to have a user, skill store, or tool return new content for the next computation.

These are not two buttons that the model literally presses. The client gives different meanings to different forms of structured language.

> `Generating content directly` and `requesting supplemental content` are both computed continuations that better fit the task instruction.

From current context, the model computes a probability distribution over possible continuations and produces one under its decoding policy: when existing material is enough, it may answer directly; when the task description and supplied material make a domain method, fresh evidence, or user clarification the better-fitting next step, it may request supplemental content.

> This “need” is a result of language patterns and contextual constraints, not proof that the model has verified what is true or has execution authority.

For a refund enquiry, if the order and policy are already present, the model can draft a reply directly. When it needs a fuller refund process, it can request refund-enquiry instructions. When the current context does not provide order status, it can request an order lookup. Skill instructions add domain method; tool results add current evidence. Both serve a more accurate subsequent content output.

## Put Capabilities Into Context as Language

A model can only compute from context it receives. For it to generate a skill-instruction request or candidate tool call, the system must express those capabilities as language or structured descriptions it can interpret. A skill should state its use case, working steps, required evidence, and stopping conditions. A tool should state its purpose, input fields, and returned data.

For example, a system could provide this capability information:

```text
Skill: Refund enquiry
Use when: a customer asks about refund eligibility, progress, or method
Steps: read policy → look up order → decide whether confirmation is needed → draft a reply or propose a controlled action
Required evidence: refund policy and current order status

Tool: Look up order
Input: order_id
Returns: payment status, fulfilment status, refund eligibility
```

These descriptions change the language space available to the model's computation. When current context does not provide order status, `lookup_order` and its argument structure become meaningful next continuations. In a context where policy and evidence are complete, drafting a reply becomes more suitable. Writing capabilities into context is not magic; it supplies more relevant conditions for computing the probability of the next token.

Some systems initially provide only a skills index. When a capability becomes a fitting continuation for the current task, the model can generate a request for that skill's instructions. After the client returns them, the model can generate a concrete candidate tool call from the newly expanded context. This avoids placing every domain rule in the initial context while keeping each capability choice observable and reviewable.

## Structured Output Makes Language Intent Recognisable as an Instruction

A model's output is still a token sequence. For software to distinguish ordinary content from a capability request, the client needs an agreed recognisable format, such as JSON, function-call fields, or a constrained instruction:

```json
{
  "type": "tool_call",
  "name": "lookup_order",
  "arguments": { "order_id": "A-1024" },
  "reason": "The order must be checked to confirm refund eligibility."
}
```

This does not mean the model has directly called `lookup_order`. Like ordinary prose, it has generated tokens that follow an agreed structure. Only after reading `type`, `name`, and `arguments` can a client treat the output as a candidate tool request rather than as an answer to display to the user.

The same output protocol can represent “request these skill instructions” or “ask the user a question”; both request supplemental content. “Task complete” is instead a task-state signal the client derives after reading the output; like EOS, it is evidence for whether the loop should continue rather than one of the two task-advancing output types. Structured output turns a next-step intention expressed in language into a candidate instruction that a system can recognise, record, and route. It allows initiative to enter a program flow without mistaking a language model for a subject that directly operates the system.

> **Execution authority does not transfer with language intent.** Structured output only marks model-generated content as a candidate instruction; the client and runtime rules still decide whether to read information, call a tool, or execute an action. Refusals, errors, and new results also become context for the next computation.

## The Client Connects Output Into a Runtime Loop

A model's initiative is rarely completed in one step, because every new piece of evidence changes the next probability calculation. The client connects these outputs into a loop:

1. It receives the user's goal and prepares task context, current state, and descriptions of available skills and tools.
2. The LLM computes and generates direct content, or requests supplemental content as a clarifying question, skill-instruction request, or candidate tool call. EOS is a separate generation-ending event that marks the end of this output segment.
3. For direct content, the client can display it. For a supplemental-content request, it obtains a user response, retrieves relevant skill instructions, or passes a candidate tool request to a controlled execution layer.
4. The execution layer returns a result, error, or state change; the client sends these, along with the current task state, back into model context.
5. In the new context, the model computes again: it may continue, ask a question, or request a capability. The client then decides whether to end the loop from EOS, task state, and runtime rules.

![Controlled runtime loop: current context enters LLM computation; the model either generates content directly or requests more content from a user, skill library, or tool. The client checks schema, permission, budget, and human confirmation before execution, then returns new evidence, errors, refusals, or state changes to context.](/images/posts/how-llms-become-proactive/controlled-loop-en.png)

In a refund enquiry, when current context does not provide order status, the model can generate a structured candidate order-lookup call. After the client returns “delivered and still within the refund window,” the model has new evidence. It can explain refund eligibility directly, or, if the customer explicitly requests a refund, generate a candidate call for another controlled action. Each round looks like a proactive decision, but is in fact the next output produced by the model function from current context.

## Stopping Conditions Keep a Loop From Wandering

Token-level ending and task-level stopping are not the same thing. EOS only means that this segment of model generation has ended. Whether the task itself is complete still requires the client to consider the objective and runtime state.

A system that can continue acting must also know when not to. Common conditions include:

- acceptance criteria are met and the result can be delivered;
- a critical input is missing and the system needs to ask the user one clear question;
- no authorised capability can resolve the current gap;
- a step, time, cost, or retry limit has been reached;
- the next step is irreversible or affects someone else and must await human confirmation;
- tools keep failing and another attempt is no longer producing new information.

The client should implement these as runtime rules instead of hoping the model remembers them. It can block unauthorised tools, reject calls over budget, stop at a loop limit, and record every model output, validation, and execution result.

## Five Checks for a Proactive Workflow

To turn language generation into a reliable proactive workflow, begin with five questions:

- **Is the generation mechanism clear?** Do you distinguish the model's probability computation for tokens, including EOS, from client-imposed stopping rules?
- **Are the two output types explicit?** Can the system distinguish direct content from supplemental-content requests, and identify whether the latter seeks content from a user, skill store, or tool?
- **Are capabilities clearly described?** Do skills and tools state their purpose, inputs, evidence, and stopping conditions?
- **Are intent and execution separate?** Does the model use a client-recognisable structure, and does the execution layer independently check authority, parameters, cost, and human confirmation?
- **Are feedback and task stopping explicit?** Do results, errors, and rejections return to context, and does the system know when to deliver, ask, or stop?

When these conditions are present, an LLM's mathematical language generation can participate in multi-step work:

- It either generates the next content directly or requests supplemental content such as skill instructions, real-world evidence, or user clarification.
- The client then obtains or executes the results needed by those requests in controlled ways and returns them to the next calculation.
- The cycle continues until a stopping condition is met.

> Initiative comes not from a prompt such as “complete the task autonomously,” but from an observable, constrained runtime made jointly by model functions, context, clients, and tools.
