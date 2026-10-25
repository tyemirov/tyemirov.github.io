# Stop asking "Is this good or bad?"

A higher-dimensional way to decide, with an interactive tool.

Most people (including me) run decisions through a binary classifier:

- good / bad
- right / wrong
- should / shouldn't

That's cheap and fast. It's also how you end up confidently making dumb moves, or freezing on decisions that don't matter.

Even when we "improve" it into a spectrum, we often stay stuck in one dimension:

- "This is kinda good."
- "I'm somewhat wrong."
- "I'm 70% sure."

A 1D scale is still a single number trying to represent a messy world. A lot of decision failures happen because one number is doing too much work.

What I want instead is a decision map: a 2D plane or a 3D space where different properties can trade off without collapsing into one score.

I built a small interactive page to make this concrete:

- Tool: https://tyemirov.net/decisioning
- Repo: https://github.com/tyemirov/decisioning

This post explains the why, the axes, and a set of practical heuristics you can use even without the tool.

---

## Why 1D thinking breaks in real life

Here's the common trap:

You ask "Is this a good decision?"
But "good" hides at least three different questions:

1. Am I correct? (confidence)
2. How much does it matter if I'm wrong? (stakes)
3. If it works, how valuable is it? (upside)

When you compress those into one label, you get noise.

Example:

- "Shipping this feature is good."

Is it?
Maybe it has high upside, high uncertainty, and low reversibility (you can't unship without cost). That is not "good or bad." That's "treat as a staged rollout with guardrails."

So the goal is not to label decisions. The goal is to output a policy:

- commit
- run an experiment
- gather evidence
- reject
- or choose a reversible version first

That's the whole point of adding dimensions.

---

## The axes I actually use

You can invent dozens of axes. Most of them are redundant or hard to score. The ones below are practical because you can rate them quickly on 0-10 and they translate into action.

### Axis 1: Confidence (Accuracy)

"How likely am I to be right?"

This is about your model of the world, not your feelings. If you had to bet money at fair odds, where would you place it?

### Axis 2: Stakes (Impact of being wrong)

"How bad is it if I'm wrong?"

High stakes decisions deserve extra structure. Low stakes decisions should not steal attention.

### Axis 3: Expected Value (Upside)

"If it works, how valuable is it on average?"

This is the mean outcome. Not the best-case story.

### Axis 4: Uncertainty (Error bars)

"How wide are my error bars?"

Uncertainty is not "bad." It's a bet-sizing input. High uncertainty should push you toward options, probes, and stage gates.

### Axis 5: Reversibility (One-way vs two-way door)

"How hard is it to undo?"

This axis changes everything. When reversibility is low, the proof bar goes up. You can still do the thing, but you do it differently.

---

## The 2D planes that fix most decision mistakes

### Plane A: Confidence x Stakes

This is the fastest way to stop doing high-stakes guessing.

High confidence + high stakes  
Policy: commit, execute, add one safeguard.

Low confidence + high stakes  
Policy: don't commit yet. Reduce uncertainty, or choose a reversible version.

High confidence + low stakes  
Policy: do it cheaply. Stop overthinking.

Low confidence + low stakes  
Policy: ignore, or run a tiny experiment if you're curious.

That's already a massive upgrade over "good/bad."

### Plane B: Expected Value x Uncertainty

This is how investors think when they're not pretending they can predict the future.

High EV + low uncertainty  
Policy: core bet, scale up.

High EV + high uncertainty  
Policy: option, probe, learn fast. Keep the bet small until uncertainty drops.

Low EV + low uncertainty  
Policy: reject.

Low EV + high uncertainty  
Policy: mostly noise. Only touch if learning is extremely cheap.

---

## The 3D space that prevents irreversible mistakes

Now add the third dimension:

**EV x Uncertainty x Reversibility (3D)**

This is the "don't take an irreversible bet while uncertain" framework.

A decision can look attractive on EV, and still be wrong to commit to because:

- the uncertainty is high, and
- the decision is hard to unwind.

In that case, the right move is usually:

- find a reversible path,
- or stage the decision,
- or explicitly buy information first.

The tool at https://tyemirov.net/decisioning renders this as a navigable 3D cube (rotate/zoom/pan), so you can actually feel how reversibility changes the policy.

---

## How to use the tool (practically)

When you open https://tyemirov.net/decisioning, you do five things:

1. Pick your case type.
   - "Truth vs stakes" (Confidence x Stakes)
   - "Bet sizing" (EV x Uncertainty)
   - "One-way door" (3D with Reversibility)
2. Write the decision in one sentence.
   - Example: "Quit job to build product full-time"
   - Example: "Ship feature X to all users"
   - Example: "Move the family to city Y"
3. Score the axes (0-10).
   - Use sliders, or drag the point on the 2D planes.
4. Review the visualization for your selected path.
   - 2D plane for confidence/stakes or EV/uncertainty, or 3D space for one-way-door cases.
5. Read the policy output.
   - It gives a deterministic next-step policy, not vibes.

Important: the tool is intentionally simple. It's not trying to "decide for you." It's trying to stop you from deciding with the wrong mental model.

---

## A worked example: quitting your job to build full-time

Let's do a decision that's common and expensive.

Decision: "Quit job to build product full-time."

Now score it honestly:

- Confidence: 4/10  
  You don't have strong evidence your product will work yet.
- Stakes: 8.5/10  
  For a family with real obligations, cash runway and health insurance are not a game.
- Expected value: 7.8/10  
  If it works, it's life-changing.
- Uncertainty: 7.2/10  
  Most startups fail; your distribution, product-market fit, and timing are unknown.
- Reversibility: 3/10  
  You can get another job, but not frictionlessly. You'll burn time, money, and optionality.

Policy that drops out (not from morality, from geometry):

- Do not take an irreversible bet while uncertain.
- Find a reversible path first:
  - part-time build
  - consulting buffer
  - staged commitment (quit later with a trigger)
  - de-risk with distribution tests and paid pilots

Binary thinking says: "Should I quit or not?"
Higher-dimensional thinking says: "How do I restructure this into a staged option?"

That's the difference.

---

## Heuristics that go beyond the webpage

The site gives you the planes and a policy. In real life you want additional tools that plug into those axes.

Here are the ones I use most.

### 1) Convert "big decisions" into staged decisions

If reversibility is low, your job is to manufacture reversibility.

Tactics:

- stage gates (commit 10%, then 30%, then 100%)
- exit clauses in contracts
- limited rollouts
- pilot customers
- reversible defaults

If you can't stage it, treat it like surgery. You don't "feel it out."

### 2) Always write "what must be true" (and test it)

For high-stakes, low-confidence decisions, you need one clean list:

- What must be true for this to work?
- Which of those is most uncertain?
- What is the fastest test that hits that uncertainty directly?

This prevents fake work. Reading 20 articles is usually not the test.

### 3) Predefine kill criteria before you run the experiment

High EV + high uncertainty is where people lie to themselves.

Before running a probe:

- define what success looks like
- define what failure looks like
- define the timebox
- define the next action for each outcome

If you don't do this, you'll interpret everything as "promising."

### 4) Bet size should be a function of uncertainty, not conviction theater

When uncertainty is high, the correct move is usually:

- smaller bet
- faster feedback
- more shots on goal

This is how you get upside without blowing yourself up.

### 5) Use a "time sensitivity" overlay

Some decisions rot if you wait (offers expire, markets move, opportunities close). Others improve if you wait.

Ask:

- What is the cost of waiting 2 weeks?
- What is the benefit of waiting 2 weeks?

If waiting is cheap and reduces uncertainty, waiting is often the best move.

### 6) Distinguish "belief decisions" from "action decisions"

Beliefs can be updated continuously. Actions often have discrete costs.

You can be 60% confident in a belief and still take a conservative action if stakes are high.

This stops you from demanding certainty where it doesn't exist.

### 7) Add a "blast radius" check

Before committing to a high-stakes action:

- if this goes wrong, who gets hurt?
- can I contain the damage?
- what's the minimum safety rail that reduces blast radius?

This is engineering thinking applied to life.

---

## A simple worksheet you can reuse

Paste this into a note before any meaningful decision:

1. Decision (one sentence):
2. Default path if I do nothing:
3. Confidence (0-10):
4. Stakes (0-10):
5. Expected Value (0-10):
6. Uncertainty (0-10):
7. Reversibility (0-10):
8. The one fact that would change my mind:
9. Fastest test of that fact:
10. Kill criteria and timebox:
11. If it works, next commitment step:
12. If it fails, what I do next:

This is boring. That's why it works.

---

## How to embed the tool in a Substack post

Substack usually allows HTML embeds. If you want the interactive page inside the post, try:

```html
<iframe
  src="https://tyemirov.net/decisioning"
  style="width:100%;height:900px;border:1px solid rgba(0,0,0,0.12);border-radius:12px;"
  loading="lazy"
></iframe>
```

If Substack blocks the iframe, you can still point readers to the tool:

https://tyemirov.net/decisioning

---

## Closing

Non-binary decision-making is not "more complicated thinking."
It's less self-deception.

Binary decisions feel decisive. They're also how you confuse confidence with stakes, upside with uncertainty, and irreversible moves with casual choices.

My goal with https://tyemirov.net/decisioning is simple:

- help you place a decision in the right space,
- then output a policy that matches reality.

If you want to see or contribute to the code, it's here:

https://github.com/tyemirov/decisioning

If you read this and feel slightly annoyed, good. That's the feeling of noticing you've been trying to solve a 3D problem with a 1D slider.
