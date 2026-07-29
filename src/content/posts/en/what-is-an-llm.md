---
title: "What Is an LLM? A Dreaming Brain With Knowledge but No Identity"
description: "From Transformers, attention, and next-token prediction to the strengths and built-in limits of large language models."
publishedAt: 2026-07-30
lang: en
tags:
  - LLM
  - Transformer
  - AI Fundamentals
  - Course
translationSlug: what-is-an-llm
---

In everyday interactions with LLMs, it is easy to treat one that can chat, write code, translate, and summarize as a person who happens to know a great deal. The metaphor is useful, but it hides the distinction that matters most: a model is not a subject living in the real world.

More precisely, an LLM is a neural network trained at enormous scale. It has language and knowledge patterns compressed from its training material, but no persistent self, lived experience, or built-in awareness of what is happening in the world right now.

I find this a useful description: **a dreaming brain with knowledge but no identity.**

> *A mind in a dream state: stripped of ego, possessing nothing but pure knowledge.*

The point is not to make a model sound mysterious. It is to see both where it is extraordinarily strong and where it must rely on a surrounding system.

The material below accompanies the interactive course [Large Language Models: Generation and Capability Boundaries](https://llm.hclife.edu.pl/model-boundaries?lang=en), whose demonstrations place these concepts back into an observable runtime.

## Core Concepts

- **An LLM (large language model)** is a neural network trained at enormous scale. It has language and knowledge patterns compressed from its training material, but no persistent self, lived experience, or built-in awareness of the present environment.
- **A token** is a basic unit an LLM reads and generates. It is not fixed to one whole word or one Chinese character: it can be a character, punctuation mark, part of an English word, or an English fragment that begins with a space. A model does not read and write full sentences all at once; it interprets a sequence of tokens and generates its output token by token.
- **A vector** is a group of numbers that gives a token its initial numerical representation; after later neural-network layers process it, that representation becomes increasingly shaped by context.

## The Nature of an LLM: A Vast Neural Network That Connects Context

A neural network consists of a great many adjustable numerical connections, usually called parameters or weights. During training, the model encounters large amounts of language, code, and other sequences and repeatedly tries to predict what comes next. When its prediction differs from the training example, the training process adjusts those connections. Across many iterations, language structure, common knowledge associations, and task patterns are compressed statistically into the weights.

> Most leading LLMs today use the Transformer architecture. The 2017 paper [*Attention Is All You Need*](https://arxiv.org/abs/1706.03762) introduced a sequence-model architecture centred on attention and dispensing with recurrence and convolutions, providing a pivotal foundation for later large language models. A complete Transformer contains more than attention: each layer also typically includes feed-forward networks, residual connections, and normalisation.

At a first approximation, attention lets the model weigh which other token representations in the context matter when processing the representation of one token. In “I put the book on the table because **it** was heavy,” resolving what “it” refers to requires relating it to earlier words and to syntactic and semantic cues.

Multi-head attention allows the model to build several such relationships in parallel. One head may capture positional or syntactic regularities while another captures reference, topic, or long-range dependencies. Those heads are not human-readable “grammar heads” or “fact heads,” but their combined associations let a model use complex relationships across a long context.

This corrects a common misconception. A model does not store training text as a library it retrieves verbatim, item by item. Training leaves patterns in the parameters; in a conversation, the model works with the context supplied now and the associations it learned through those parameters.

## How Does an LLM Produce an Answer?

Set aside the implementation details for a moment and keep a compact, accurate model in view:

```text
P(next token | current context)
```

Given the current context, the model estimates a probability distribution over the next token. A decoding process selects one token, appends it to the context, and repeats. After many iterations, we see an answer, a summary, code, or a structured request to call a tool.

```text
current context
→ probabilities for the next token
→ select one token
→ append it to the context
→ predict again
```

During inference, the trained weights normally remain fixed. Adding a current policy, retrieval result, or tool response changes the basis for this response, but does not permanently teach the model that information. Sampling settings such as temperature affect how randomly the system selects among candidate tokens; they do not add knowledge or make a claim true.

Token-by-token generation is not meaningless random word association. A model combines patterns of grammar, meaning, style, code structure, and task context, so it can produce coherent and often useful work. But it is still generating what most plausibly follows in the current context. It does not inherently retrieve one uniquely current, verified answer.

> From text to text, the model operates as follows:
>
> ```text
> text → token sequence → token-ID sequence → embedding-vector sequence → neural network (including attention) → probability distribution for the next token → decoding / sampling → next token → append to context → repeat until the response is complete
> ```
>
> Converting text into tokens is **tokenization**, and each token is mapped to a token ID. An **embedding** is the next step: the model turns each token ID into a numerical vector. You can think of an embedding as a token's numerical representation in a high-dimensional space: similar patterns of use create relationships in that space that the model can work with. The model also combines positional encoding or another form of position information to distinguish different token orders; these position-aware vectors form the sequence used by attention and the rest of the neural network.

## Why Call It a “Dreaming Brain”?

Dreams can contain rich knowledge, language, and imagery without reliably matching the reality of this place and moment. A trained LLM is similar: it contains many learned patterns, but has no senses continuously observing the world, an inherent task identity, or a position in which it must bear the consequences of its answer.

### 1. A Knowledge Snapshot Frozen at the End of Training

After training, an LLM is a set of fixed parameters. New context changes the basis for one response, but normally does not change those parameters. In that sense, the model is closer to a knowledge snapshot frozen at the end of training than to a subject continuously updating with the world.

Retrieval results, tool responses, and conversation history can let it answer from new material, while fine-tuning can produce a new version of the model. The first is an external system adding context; the second trains or adjusts parameters again. Neither means that the model naturally accumulates lived experience in one conversation.

### 2. Learned Patterns Are Not Lived Experience

The model compresses language, knowledge, and behavioural patterns from training material. People form experience through embodied perception, social relationships, feedback from action, and continuous memory. A model can write as though it has had an experience or imitate a style, but that does not mean it has lived through those events.

It therefore does not naturally know:

- the live weather in Shanghai this afternoon;
- the latest travel-expense policy at your company;
- what “this still does not work” refers to;
- whether it is allowed to change an order, or who is accountable for a high-stakes decision.

### 3. No Endogenous, Persistent Identity or Behavioural Memory

More precisely, an LLM has no built-in, persistent identity state, personal goals, or autobiographical memory across conversations. It can play a role because role instructions, behavioural rules, and history are written into the current context. When that context is no longer supplied, the model does not naturally retain the memory or form a stable habit because of one action.

Without current evidence, a task objective, and behavioural constraints, it will still try to continue with something that looks like an answer. That is not deliberate fabrication. It is a natural consequence of probabilistic generation when information is missing. Fluent language demonstrates language ability; it does not prove a fact has been checked.

The model is a dreaming brain frozen at the end of training: its parameters preserve learned knowledge and patterns, but it has no mechanism for continuously sensing reality, accumulating experience, or maintaining a self. For it to participate reliably in a real task, an external system must provide that real environment.

## LLM Strengths: Where Is It Stronger Than a Person?

Placed in the right role, an LLM can genuinely overcome several hard limits of human language work.

### Broad, Cross-Domain, Multilingual Knowledge

- **Breadth across domains and languages:** one model can switch among subjects, languages, and styles in a single conversation, quickly drawing on broad language patterns learned in training.
- **Cross-domain association and pattern recombination:** it can rapidly reorganise language and structural patterns from different fields, making it useful for divergent thinking, rewriting, analogy, brainstorming, and exploring multiple options.

### Free From Biological Constraints

- **Scale and speed:** with an appropriate context window, retrieval, and chunking process, a model can quickly organise, summarise, classify, and compare large bodies of text.
- **Repetition and concurrency:** when compute and systems allow, one model can be deployed across many simultaneous conversations, providing personalised language interaction for different users.
- **Consistent work without fatigue:** under the same input and system conditions, it can continuously handle repetitive, high-frequency text tasks while maintaining a consistent interaction format.

These strengths **do not replace human judgement**. They are better used to free people from large-scale, repetitive processing, leaving human attention for setting objectives, assessing evidence, judging exceptions, and taking responsibility.

## LLM Limits: What Does It Inherently Lack?

The same generative mechanism creates limits that cannot be removed by making a model merely more articulate:

- **Current facts and sources:** without trustworthy material or live data, a model cannot inherently guarantee that an answer reflects the current world.
- **Deterministic calculation and complex conditions:** multi-step exact calculations, long reasoning chains, and combinations of complex conditions can accumulate errors. A fluent derivation does not guarantee numerical or logical correctness.
- **Clear task boundaries:** on an ambiguous request, a model may fill in the object, goal, or scope. In the real world, asking a question is often the correct action, not guessing.
- **Authority and accountability:** a model cannot independently refund a payment, write to a database, or bear the consequences of medical, legal, financial, or compliance decisions.

So the useful question is not simply, “Is an LLM reliable?” The real question is whether the task has clear boundaries and instructions:

> **Does this task need language organisation, or does it need current facts, deterministic calculation, controlled execution, or accountable judgement?**

## How Do We Measure LLM Performance?

“A stronger model” is not one number. Start with its specifications to understand its resource boundaries:

- **Total parameters:** roughly, the model's total capacity for compressing knowledge and patterns. More parameters can help it hold richer knowledge relationships and more complex patterns, but actual knowledge coverage and reasoning performance also depend on training data, training methods, post-training, and inference settings—not parameter count alone.
- **Active parameters per token:** in a mixture-of-experts (MoE) model, only some experts are used at a time. This number is closer to the computation needed to generate one token, so it often affects inference speed and cost.
- **Maximum context window:** how many tokens a model can read and generate in one request. A larger window lets it receive more material, but fitting text into the window does not guarantee that the model can find and use the important parts accurately; real long-material tasks still need to test that ability.

Industry benchmarks are like standardised exams: they use the same questions and rules to compare models on a defined task, such as knowledge and reasoning, Chinese comprehension, mathematics, code, or long-context use. MMLU, C-Eval, LiveCodeBench, and SWE-bench are common examples.

These scores help narrow down candidates, not create a universal ranking. Model versions, prompts, tool access, and your real task all change the outcome. The final check should still use your own examples to measure success, error types, latency, and cost.

## Bringing the Dreaming Brain Into Reality

An LLM is most useful as a powerful layer for language and pattern work—not as a fact engine, autonomous executor, or responsible party.

To involve that dreaming brain reliably in a real task, an application must supply what the model does not possess: background for the current task, relevant history and memory, a clear identity and objective, and rules for its behaviour. When new information is needed, it must also be able to obtain evidence through controlled tools.

The next article, *How to Use LLMs to Their Strengths*, separates these elements of a “real environment”: context, persona, rules, and tools—what each solves, and why none should be mistaken for a magical prompt.

You can also explore the interactive course: [Large Language Models: Generation and Capability Boundaries](https://llm.hclife.edu.pl/model-boundaries?lang=en).
