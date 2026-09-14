# How Big Does a Modern Civilization Need to Be?

I keep running into two opposite instincts whenever people talk about "the right" population for a society. One says: *more people is better*. The other says: *more people is worse*.

Both are persuasive. Both are incomplete. And neither tells me the one thing I actually want to know:

> If I want modern living (reliable power, clean water, basic medicine, a functioning market), what is the smallest civilization that can keep itself running without slowly falling apart?

This post is my attempt to answer that question without turning it into a culture war. I'll walk through two familiar lines of argument (economic vs. Malthusian), then introduce the third line I actually find useful: a quantitative "minimum viable" view that also cares about cultural cohesion and quality of life.

The secret sauce is the little page/model we built: [tyemirov.net/civilization](https://tyemirov.net/civilization/). It treats civilization as a dependency graph and puts numbers on two quiet requirements of modernity:

- **Core staffing**: enough people to operate and maintain essential systems.
- **Expert replacement**: enough new specialists each year to replace the ones you lose.

If those sound unromantic, good. Civilization is unromantic.

---

## Argument 1: The Economic Instinct (Bigger = Richer)

The economic story is deeply intuitive:

- More people means a larger market.
- Larger markets support deeper specialization.
- Deeper specialization raises productivity.

Adam Smith's famous line is blunt: the division of labor is limited by the extent of the market. In plain language: you don't get a pin factory, a semiconductor supply chain, or a modern hospital in a village.

Modern versions of this instinct often go further: more people also means more minds, and more minds means more ideas.

Economists like Michael Kremer formalized that intuition: with more people, you expect more innovation, which can lift carrying capacity and output over long time horizons.

The economic instinct is why "how big" often gets translated into "how much GDP." If your north star is output, the easiest answer is: *as many people as possible, as long as your institutions don't collapse.*

This is a coherent argument. It just smuggles in two assumptions:

1. That "more output" is the thing we're optimizing.
2. That the physical world is a background constraint, not the main stage.

Which brings us to the second instinct.

---

## Argument 2: The Malthusian Instinct (Bigger = Riskier)

Malthus' original claim (simplifying) is: population tends to grow faster than food supply, so pressures accumulate until something breaks.

Even if you reject Malthus' specific mechanics (and history gives reasons to), the broader family of worries never went away. It just changed outfits:

- Ecological limits.
- Pollution sinks.
- Biodiversity loss.
- Resource depletion.
- Climate forcing.

The modern Malthusian instinct isn't always "we will run out of food." Often it's "we will exceed the safe operating space." The *Limits to Growth* tradition and the more recent "planetary boundaries" framing are both versions of that.

This instinct is also coherent. It just tends to treat people as pressure and forget that people are also capability.

So we get two slogans that fight forever:

- "People are the ultimate resource."
- "There are too many of us."

I don't think either slogan is wrong. I think they're answering different questions.

The question I care about is narrower:

> What is the minimum population that can sustain *modern* systems without importing its fragility?

That is not a question about maximizing output or minimizing footprint. It's a question about *viability*.

---

## The Third Line: Minimum Viable Modernity (With Cohesion)

Here's the move: stop debating the "ideal" number and instead ask what constraints create a floor.

The page we built models civilization as a stack: **critical domains** (food, water, energy, logistics, manufacturing, governance, institutions, finance, telecom, medicine, education, etc.) connected by **dependencies** (food depends on energy, fuel, chemicals, logistics, manufacturing).

Then it runs two checks:

- **Staffing**: do we have enough core workers per capita?
- **Pipeline**: can we replace scarce experts over time?

Finally it defines the minimum population as the larger of the two: `minimum population = max(staffing population, pipeline population)`.

This is deliberately not an optimization. It's a feasibility check. It doesn't tell you what would be ideal. It tells you what breaks first.

And it exposes a truth I think most population debates miss:

> Modernity is not just labor-intensive. It's expertise-intensive.

A society can have enough hands and still fail because it can't keep enough high-skill roles staffed over decades.

---

## What the Model Says (Default Scenario)

I need a baseline. I don't want to cherry-pick a utopia or a catastrophe. So I set up something like a "competent region."

It is large enough to have real infrastructure, not fully autarkic but not lazily dependent either, with modern-ish life expectancy and workforce participation, and minimal education/institutional complexity (enough to function, not enough to win a Nobel prize).

In the page controls, that comes out roughly as `region` / `robust` / `import-light`, with a coverage factor of `5.0` (shift coverage, time off, training, sickness).

Demographically: life expectancy `75`, work `18`-`65`, fertility `2.10`, survival to working age `0.98`. On labor: workforce participation `0.75`, core fraction `0.35`. For expertise: training completion age `25`, expert attrition `0.020`.

Education is set to `minimal`: enough schooling to keep the machine running, not enough to make scarce expertise cheap.

Under those assumptions, the model comes back with:

- **Minimum population**: about **6.15M** (6,149,781)
- **Binding constraint**: **Expert pipeline**
- **Core workforce required**: about **356k FTE** (356,078)
- **Staffing-only population** (if expertise didn't bottleneck): about **2.16M** (2,164,610)

Translated: the staffing math is not what sets the floor here. The floor is set by the replacement of scarce specialists. If you design around the staffing-only number, you'll look fine for a while, and then you'll discover you're bleeding expertise faster than you can replace it.

This is where my intuition flips. The hard part isn't "can we assign enough people to the essential jobs?" It's "can we keep producing the next generation of scarce specialists fast enough to replace the ones we lose?"

One note on language: the model talks in workers and FTE, and that sounds like "employment." Read it as organized productive capacity. Call it jobs, duty, contribution, guild labor, whatever. The point is: someone has to show up every day to keep the stack running.

### The Top Bottleneck Is Energy
In this baseline, the first domain to hit the wall is the electric grid (`energy`). Not because it needs the most hands, but because it needs a steady stream of scarce expertise.

Pipeline-driven minimum population by domain (largest wins):

- `energy` (electric grid): **6.15M**
- `machine_tools`: **5.74M**
- `chemicals`: **4.92M**
- `fuel`: **4.51M**

That ordering matches a lived reality: electricity is upstream of everything, and the industrial backbone behind "keep the lights on" is deeper than it looks.

---

## Reading the Pipeline Bottleneck (Without the Algebra)

I could walk you line-by-line through the arithmetic. I won't, because it turns the essay into a spreadsheet and the page already does the accounting.

Here is the mental model. Each critical domain has a pool of scarce experts, and each year you lose some of them (retirement, burnout, accidents, career change).

Meanwhile, each year you produce a cohort of new adults, and only a thin slice of that cohort can realistically become those experts. The pipeline constraint asks a simple question: is the slice big enough, year after year, to replace what you lose?

When the answer is "no", the required population is simply whatever makes it "yes".

If you want to see this directly, use the page like an instrument:

- On the Dashboard, look at **Constraint: expert pipeline** and the **Top expert pipeline drivers** list.
- In **Domain data**, compare "Pipeline pop" across domains. The biggest number is the floor.

The practical punchline is that the pipeline behaves like a lever. Change the quality of education, the friction of institutions, or the degree of self-sufficiency, and you're not just moving comfort around. You are widening or narrowing the eligible funnel that keeps modernity staffed.

---

## Dependencies: Why "Just Add X" Doesn't Work

The dependency graph matters because domains aren't independent checkboxes. A few examples from the default graph:

- Food depends on: energy, fuel, chemicals, logistics, manufacturing.
- Fuel depends on: energy, manufacturing, machine tools, logistics.
- Finance depends on: institutions, telecom.
- Institutions depend on: governance, education.

This is where the model gets interesting: you can make a "small" civilization by deleting domains, but you very quickly discover that the remaining ones stop being feasible.

Civilization is a stack.

---

## Sensitivity: What Moves the Minimum?

A few scenario results from the current defaults:

- Baseline: feasible; **6.15M**; pipeline-bound, energy bottleneck.
- Town scale: feasible; **2.15M**; same structure, smaller footprint.
- Nation scale: feasible; **36.90M**; essentially 6x the region baseline.
- Import-free: feasible; **7.38M**; autonomy costs people.
- Redundant resilience: feasible; **7.07M**; redundancy costs people.
- Education: modern: feasible; **4.92M**; more eligible experts lowers pipeline.
- Institutions+Finance: minimal: feasible; **8.04M**; higher friction + lower human capital.
- Institutions+Finance: off: feasible; **12.61M**; friction spikes + eligibility collapses.
- Below replacement fertility: not feasible; **7.17M**; pipeline worsens; demography fails.

Two takeaways:

1. The minimum is not "one number." It depends on governance capacity, education, and how locally self-sufficient you want to be.
2. The binding constraint being the expert pipeline is a warning: you can't bluff your way through specialist scarcity.

---

## What This Model Ignores (On Purpose)

This is a feasibility lens, not a full simulator. It intentionally ignores (or compresses) many things that matter:

- Geography, siting, and transport topology (everything is implicitly "well-connected").
- Energy source mix and resource constraints (it treats "energy" as a domain you can staff, not a fuel you can run out of).
- Wars, disasters, and political instability (other than a crude resilience multiplier).
- Non-market production and informal labor (the model uses "employment" as a proxy for organized productive capacity).
- Real-world training pipelines, credentialing, and bottlenecks (it collapses this into an "eligible fraction" and attrition).

If you're reading the numbers correctly, you're reading them as: *order-of-magnitude constraints* plus *which dependencies bite first*.

---

## Cohesion: Millions of People, Human-Scale Lives

Now the part that doesn't fit neatly into a spreadsheet.

Even if the minimum viable modern civilization is on the order of millions, that doesn't mean people must live in an emotionally inhuman "mass society." The unit of lived cohesion can be much smaller than the unit of technical viability.

A healthy way to think about this is layered scale:

- **Small groups** for trust, care, identity, and daily life.
- **Mid-scale communities** for civic projects and local governance.
- **Regional-scale systems** for the hard infrastructure and the expert pipeline.

Dunbar's work is often cited here (with lots of caveats) as a reminder that humans don't scale intimacy linearly. Elinor Ostrom's work on polycentric governance is a reminder that governance doesn't have to be one giant machine to operate at large scale.

So the third line of argument I'm advocating is:

> Build for a minimum viable *technical* scale, but design for a human-scale *cultural* scale.

This is how you keep quality of life from being eaten by the very systems that make modernity possible.

---

## How to Use the Model (If You Want to Think With It)

A good way to read the page is:

- Open the live model: [tyemirov.net/civilization](https://tyemirov.net/civilization/) (or run it locally from the repo).
- Hit "Reset defaults" if you want to match the baseline numbers in this essay.
- Treat the **dependency graph** as the civilization "stack trace."
- Watch which domains become **pipeline-bound** as you change assumptions.
- Notice when the binding constraint flips (if it ever does).

If you want a single experiment that reveals the model's worldview:

- Turn education up to modern.
- Then turn institutions/finance down.

You'll see that the model treats "human capital" and "market friction" as multiplicative forces. That's exactly the kind of boring, structural truth that tends to dominate real outcomes.

---

## Closing Thought

The economic instinct says: "more people, more output." The Malthusian instinct says: "more people, more pressure." Both are true in their domains.

But the question "how big does a modern civilization need to be?" is about neither output nor pressure in isolation.

It's about sustaining an interdependent stack of systems across generations.

If the model is right even roughly, the floor is set less by how many hands you have and more by whether you can keep replenishing the people who know how to keep the lights on.

And once you accept that floor, the real design question becomes cultural:

> Can we build a society that is technically large enough to be viable, but socially structured enough to remain worth living in?

That is the kind of "population" question I actually care about.

---

## References / Anchors

- Thomas Malthus, *An Essay on the Principle of Population* (1798): [Project Gutenberg](https://www.gutenberg.org/ebooks/4239)
- Adam Smith, *The Wealth of Nations* ("extent of the market"): [Book I, Ch. 3](https://www.marxists.org/reference/archive/smith-adam/works/wealth-of-nations/book01/ch03.htm)
- Donella Meadows et al., *The Limits to Growth* (1972): [Dartmouth archive](https://www.dartmouth.edu/library/digital/publishing/meadows/ltg/)
- Planetary boundaries (overview + context): [NASA GISS brief](https://www.giss.nasa.gov/research/briefs/rockstrom_09/)
- Michael Kremer, "Population Growth and Technological Change" (1993): [QJE abstract](https://academic.oup.com/qje/article-abstract/108/3/681/1842784)
- Robin Dunbar, "Neocortex size as a constraint on group size" (1992): [Journal of Human Evolution abstract](https://www.sciencedirect.com/science/article/abs/pii/004724849290081J)
- Elinor Ostrom, polycentric governance (one entry point): [PNAS (2010)](https://www.pnas.org/doi/10.1073/pnas.0905356107)
- Demographic transition + fertility decline (Our World in Data): [Demographic transition](https://ourworldindata.org/demographic-transition)

---

## Glossary

- **Autarky (imports)**: How much you assume the civilization can lean on imports. Moving toward "import-free" makes the stack more self-contained, which usually raises the minimum population.
- **Binding constraint**: The constraint that actually set the minimum in a scenario (core staffing vs expert pipeline).
- **Core fraction of workers**: The fraction of all workers allocated to the critical domains. Higher makes staffing easier, but assumes fewer people can work on non-core life.
- **Core staffing**: The day-to-day labor needed to operate and maintain the critical domains (plus other modeled labor categories inside the core total).
- **Core workforce (FTE)**: Full-time equivalents required across all enabled critical domains.
- **Coverage factor**: A multiplier that turns "we need X people on the job" into a larger headcount to cover shifts, training, vacations, sickness, and slack. High coverage makes the model more realistic and the minimum larger.
- **Critical domains**: The sectors the model treats as non-negotiable for "modern living" (food, water, energy, logistics, manufacturing, governance, institutions, finance, telecom, medicine, education, etc.).
- **Dependencies**: Upstream requirements between domains (for example: food depends on energy, fuel, chemicals, logistics, and manufacturing). Missing dependencies makes configurations infeasible.
- **Expert attrition**: The annual fraction of experts you assume you lose for reasons other than retirement (burnout, accidents, career change, migration).
- **Expert pipeline**: The long-run ability to replace scarce experts as they exit. In many scenarios this is what forces the real minimum.
- **FTE (full-time equivalent)**: A standard unit of labor. Two half-time workers is 1.0 FTE.
- **Feasible**: A configuration that satisfies dependencies and passes the model's demographic and staffing checks.
- **Human-capital multiplier**: A factor (driven by institutions/finance/education settings) that changes how many people are realistically eligible to become scarce experts.
- **Minimum population**: The smallest population that makes the configuration feasible, computed as `max(staffing population, pipeline population)`.
- **Pipeline pop**: For a given domain, the population needed so the yearly cohort of new adults can replace that domain's expert losses. The largest "pipeline pop" across enabled domains sets the pipeline floor.
- **Resilience**: An assumption about how much redundancy the system carries (fragile vs robust vs redundant). More resilience generally costs people.
- **Scale**: A knob for how large and internally complete the civilization is assumed to be (town vs region vs nation). Larger scales require deeper capability and more staffing.
- **Staffing population**: The population required so that (given participation and allocation assumptions) the available core workforce meets the required core workforce.
- **Staffing-only population**: The staffing population, ignoring the expert pipeline constraint. It is a tempting number and often the wrong floor.
- **Training completion age**: When new experts "arrive" after training. Later completion shortens career length and makes replacement harder.
- **Workforce participation**: The fraction of working-age people assumed to be in the workforce.
