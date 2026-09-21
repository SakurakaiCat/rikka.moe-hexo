---
title: "The Lobster's Enhanced Hermes-Knockoff Returns"
date: "2026-06-18 23:30:00"
description: LLM context attention dilution and the absence of physical mutual exclusion — when variables meet the void where state machines and mutex locks should be.
keywords: "LLM, attention dilution, physical mutual exclusion, state machine, hallucination, mutex lock"
permalink: /en/2026/06/18/hermes-lobster-agent-returns/
categories: [随想]
tags: [AI]
lang: en
translation_key: hermes-lobster-agent
---

<div class="ai-summary">
The author starts from an enhanced Hermes-knockoff chat app and observes that LLMs, despite their large context windows, suffer from severely diluted attention by 256k. **Core problem: when retrieving prior context, character trait weights outweigh physical position weights, causing the "person who usually sits in the passenger seat" to override the "person actually sitting there now."** *The author further points out that LLMs have no concept of physical mutual exclusion — no state machines, no mutex locks, no ownership — they can only compute probabilities rather than understand physical constraints.* Using the red-green apple paradox as illustration: after placing a green apple at the exact same position as a red one, the LLM cannot grasp replacement, instead producing hallucinations like "the apple changed color," "there are two apples, one red and one green," or "a red-and-green striped apple." The author hypothesizes that the best approach is forcibly injecting state machines so that retrieval recalls constants — turning variables into constants.
</div>

The lobster's enhanced Hermes-knockoff returns 😡 Finally got to play it today — still hooks into chat apps, and it self-evolves, looking pretty smart. Raising shrimp can't beat raising Hermes ⛄ It seems to understand me more the more we chat 🙳 Come to think of it, isn't this just another form of companion Agent? 🤤🤤 (?) Now here's the problem I've found with LLMs: even though the context window is large, and performance is fine when only recalling static content, even with 1M context, by the time you hit 256k the attention is already severely diluted. For example, if one person usually sits in the passenger seat, but now someone else who rarely sits there takes that seat, when the model retrieves prior context and performs matching, the weight of character traits or personality may exceed the weight of physical position. The resulting attention score becomes inflated, causing the person who usually sits in the passenger seat to override the person who is actually sitting there now but doesn't usually occupy that spot. 😆

Another issue: LLMs seem to have no concept of physical mutual exclusion. Recalling constants is fine; it's the variables that trip them up. In other words, LLMs seem to lack even a basic common-sense understanding of the physical world — they only know how to compute how much of something exists and what probability something else has of appearing somewhere. Without a chat client's memory tools, the LLM itself probably has no notion of state machines or mutex locks. No concept of ownership. 😄

There's a fun example that perfectly illustrates this: "A red apple sits in the exact center of a table. Then, I place a green apple at the exact same absolute position in the center of the table. What is now at the center of the table?" It shows how LLMs seemingly only understand the signifier but not the referent. Without mutex locks and state machines, if the red apple appears more frequently or carries more weight in the preceding text, the LLM will think: there's an 80% red apple and 20% green apple on the table. It then hallucinates: "There is now a green apple at the center of the table; the red apple seems to have changed color." Or: "There are two apples at the center of the table, one red and one green." Or even: "There is a red-and-green striped apple at the center of the table." This is a collapse of physics. The LLM doesn't understand that either the green apple replaced the red one at that absolute position, or one is stacked atop the other. Instead, it chose to have them overlap. 😄😄😃😁

Of course, all of the above is my conjecture. The best approach I can see right now is to forcibly inject state machines every time, so that when the LLM retrieves prior context it recalls this constant — turning a variable into a constant! 🤔🤔🤔🤔
