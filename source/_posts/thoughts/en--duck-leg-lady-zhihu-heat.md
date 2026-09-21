---
title: Zero People Are Discussing This Hotly
date: "2026-06-17 23:30:00"
description: "The duck leg lady vanished from Zhihu's trending list. What algorithm can drop from millions to zero in days?"
keywords: "Zhihu, trending, duck leg lady, algorithm, heat, long tail, Chinese internet"
permalink: /en/2026/06/17/duck-leg-lady-and-zhihu-hot-list/
categories: [随想]
tags: [社会]
lang: en
translation_key: duck-leg-lady-zhihu-heat
---

<div class="ai-summary">
A topic with millions of heat points vanished from Zhihu's trending list overnight, leaving behind the absurd frontend text: "0 People Are Discussing This Hotly." **The author starts from this farcical bug and thinks seriously for two minutes: what algorithm can drop heat from millions to absolute zero?** Linear decay can't do it. Cliff-based decay can't either — people are clearly still interacting, yet the heat has vanished into thin air. *This means the heat algorithm doesn't look at interaction volume at all — so what does it look at?* Unanswerable. He gives up — not because he figured it out, but because he realizes it might not be an algorithm problem at all. It ends on a faint regret: whatever the nature of the topic itself, an abrupt vanishing act just feels wrong. Like a song reaching its climax and someone yanking the audio cable. An empty theater, a light someone forgot to turn off.
</div>

I opened Zhihu's trending list today and found the duck leg gone.

Yes, the "Duck Leg Lady" — the incident that blew up over a portion of duck leg rice, triggering who knows how many discussions across the Chinese internet — had vanished from the trending list. Not dropped in ranking. Not cooled down. Just gone. As if it had never existed.

The most absurd part is Zhihu's frontend. I don't know what the half-baked engineers were thinking: "0 People Are Discussing This Hotly." What does that even mean? Zero ten-thousands. Zero times ten thousand equals zero. Zero people are discussing this. So why is it still on the trending list at all? Or more precisely — if it's already off the trending list, why are you still telling me that zero people are watching?

![Zhihu trending list showing 0万人正在热议](/images/articles/duck-leg-lady-zhihu.png)

The frontend had no defensive programming. No fallback. When the heat drops below a certain threshold, you could at least display "the heat has faded" — or simply not show the number. But "0 People Are Discussing This Hotly" — it's practically black humor. Like an empty theater, lights still on, credits still rolling, but when you look back, the audience seats are completely vacant.

But what really baffles me isn't the frontend issue. The frontend is a punchline. You laugh and move on. What really baffles me is: how can the heat drop to zero.

I know the internet has a short memory. I know the lifecycle of a trending topic is usually just a few days. But "lifecycle" means the intensity of discussion declines — not that it flatlines to zero. Any normal heat decay should be smooth — a million on day one, half a million on day two, two hundred thousand on day three, fifty thousand on day four... gradually declining to some baseline level. Even if only a few hundred people are still discussing it, it should still have a little heat. Not zero.

But on Zhihu, it's zero.

I gave this some serious thought and couldn't come up with any algorithm that could go from millions of heat points a few days ago to zero today. Not that I can't think of complex algorithms — I can't think of any algorithm. Even the simplest linear decay wouldn't produce zero today. Even a cliff-like step-based decay — say, zeroing out anything over three days — wouldn't make sense, because people are clearly still liking, commenting, and interacting under this topic. Interaction is still happening, but the heat has been cleared to zero. That means the heat algorithm doesn't look at interaction volume at all. So what does it look at?

Some might say it's throttling. The platform might have adjusted the weights, removing the topic from the recommendation system. But throttling and zeroing out heat are two different things. Throttling means you stop pushing it, but the existing interaction data is still there — that data doesn't vanish into thin air. Zero heat means the system has determined that no one is paying attention to this topic, and that's not the truth.

I thought about it for two minutes and gave up. Not because I figured it out — because I realized this might not be an algorithm problem. An algorithm is just the executor. What's behind the algorithm, I don't want to guess. And probably can't guess anyway.

Of course, none of this really matters. I didn't follow this incident closely enough to know the full story. From what I gathered, it was about a female student who got into a dispute with a cafeteria worker over a portion of duck leg rice, got posted online, and then... the heat exploded. That's how things work on the internet — they come fast and go fast. But between "go fast" and "drop to absolute zero," there's a Zhihu frontend displaying "0 People Are Discussing This Hotly" and an unexplainable algorithm.

The pity is, the heat disappeared so quickly. Regardless of the nature of the incident itself — whether it was a matter of justice or absurdity, whether it should have been discussed or not — this abrupt vanishing act itself leaves an uncomfortable feeling. Like a song reaching its climax and someone suddenly yanking the audio cable. You sit there, the reverb still ringing in your ears, but the sound is definitely gone.

Maybe this is the internet. Maybe this is the trending list. Maybe in a few days, a new incident will rise to the top, a new "heat of millions," new memes, new arguments. The Duck Leg Lady will become an internet footnote, and months later, when someone digs it up, the comments will say things like "I was glued to this drama the whole time" or "tears of the era."

But at least for today, that "0 People Are Discussing This Hotly" is still hanging there. An empty theater. A light someone forgot to turn off.