# What the School Ranking Leaves Out

*I built School Atlas to compare schools with the cost of family life around them and see where a dollar buys more.*

Editorial draft for Substack. The publication and final article URL have not been selected.

The school near the top of a ranking has an obvious appeal. The harder judgment is whether the life around it is worth what a family would have to spend. Rent, tuition, and daily travel keep showing up long after the school search is over. A higher position on a list needs to be considered alongside that recurring bill. The community the family would call home matters, too.

I built School Atlas because I care about where a dollar buys the most. An expensive place may offer excellent schools and a great deal besides. I want to understand what a family gets for that expense, and whether another place offers more for its money. That requires putting school rank, community quality, and estimated family costs into the same comparison. Those measures can pull in different directions.

School Atlas puts that comparison on a graph. Moving up means a better position in the selected publisher's school ranking. For public and private day schools, moving right means a higher Value index: more community quality relative to estimated annual family spending. School rank stays outside that index, so academic position and community value remain separate judgments. The graph lets a family examine both and decide what is worth paying for.

## Start with the schools a child can attend

Before comparing costs, a family needs to understand how a child can enter each school. Living nearby, entering a lottery, and applying for admission lead to different choices. School Atlas separates its schools into three groups, each with 100 entries. **Local public** contains schools with documented ordinary residential entry at high-school level, without a lottery or selective admission. **Lottery/selection** contains public schools with a lottery or selective entry route. **Private** contains campus-based private schools with application requirements and published cost evidence.

Each group contains the first 100 qualifying schools in rank order, with no school duplicated between groups. Online schools are excluded. The original publisher ranks remain visible, which explains why a local public school can have a national rank above 100. Schools ahead of it can belong to the lottery or selective group. The distinction is between the top 100 schools that meet a particular admission condition and the first 100 entries in an unfiltered ranking.

Public and private ranks also need to stay separate. Public-school positions come from the U.S. News 2026–2027 edition, while private schools use Niche's 2027 ranking. A private rank of 20 and a public rank of 20 describe different ranking populations. Exact public positions mainly use HighSchoolTrends' republication, with source links and admission evidence retained. Checking two presentations of that secondary source does not provide independent confirmation from the ranking publisher. The tool retains that limitation alongside the numbers.

## Build the comparison around the family bill

Once admission is understood, the next question is what the family would spend to make the choice work. A metropolitan price index can hide large differences in local housing costs, so the model begins with a concrete assumption: a three-bedroom rental. It uses the school campus ZIP and FY2027 HUD gross-rent benchmarks, including covered utilities. This gives the comparison a local housing basis. It does not establish an attendance boundary or show that a suitable rental is available today.

For public and private day schools, the annual estimate adds twelve months of that rent to other household spending and school costs. Tuition and known school fees scale with the selected number of children, while known household school fees are added once. Private tuition belongs in this total because a low rent cannot erase a large school bill. The model uses sourced tuition and known required fees before financial aid. Published tuition years and unresolved charges remain visible in each school card.

Other household spending starts at $52,956 per year, derived from BLS 2024 spending for three-person households. Shelter and covered utilities are removed before local rent is added. Education, cash contributions, and personal insurance and pensions are also excluded. Food, transportation, health and vehicle insurance, phone and internet, and household goods remain in the benchmark at national 2024 prices. This is a common basis for comparison, rather than a researched bill for a particular family. Readers can change the assumptions and the number of children.

Boarding requires a different calculation because the family can remain at its current home. The model adds the boarding package and known travel to a default home-spending benchmark of $74,326 per year. It does not automatically reduce food or utility spending while a child boards. Campus rent is excluded, and the campus community score does not represent the family's home. Boarding uses an annual-cost comparison, with lower estimated family cost toward the right of the graph, rather than a family Value index.

The private catalog keeps day and boarding as separate alternatives. Its 100 unique schools provide 96 priced day alternatives and 32 priced boarding alternatives. Some schools offer both, but those alternatives do not turn one school into two schools. Separating the arrangements lets a reader compare the cost of attending as a day student with the different household assumptions behind boarding.

## Relate the bill to what the community offers

The annual estimate answers the cost question, but a family also needs to consider what that spending buys. For public and private day schools, the Value index relates that cost to an equal-weight average of six AARP categories. Those categories are housing, neighborhood, transportation, environment, health, and engagement. Together they provide a community proxy, not a school quality score.

**Value index = community score × 64,877 ÷ estimated annual family cost**

The fixed factor puts the ratio on a readable scale without changing the order of places. The result has no dollar unit and is neither a percentile nor a score out of 100. For example, a community score of 60 and an annual family cost of $100,000 produce an index of 38.9. At $80,000, the same community score produces an index of 48.7. The community quality has not changed, but the estimated spending needed to obtain it is lower.

This choice also gives affordability additional weight. The AARP community score already includes affordability measures, and dividing by family cost emphasizes affordability again. That is a limitation a reader needs to understand when interpreting the result. The community inputs also combine different years and geographic areas. The index offers a way to examine the relationship between those inputs and spending, with school rank still available as a separate judgment.

## Keep the uncertainty in the picture

A useful comparison must distinguish an estimate from a complete price. School Atlas uses **≈** for estimates and hollow points for unpriced costs. For day schools, missing required charges create a Value index ceiling, marked **≤**, because additional spending can reduce the final value. For boarding, they create a known cost floor, marked **≥**, because the final bill can be higher. Unknown travel is not treated as a verified zero. Published cost ranges and five-day boarding arrangements remain visible, too.

These details affect how a family can use the result. Financial aid, moving costs, and optional charges can change the actual total. A campus ZIP still needs an address check, an admission route still needs confirmation, and a published fee still needs a current school quote. The graph helps identify places worth examining more closely. A reader can then select a school, inspect its costs and sources, and examine the assumptions against the family's plans.

That brings the search back to the question that started it. A school ranking is one part of a family decision whose costs extend well beyond the school itself. School Atlas puts more of that decision in view, while keeping the evidence and its limits available for inspection. The goal is to find places where the family's dollar buys more of the life it wants.

[Open School Atlas](https://tyemirov.net/school-atlas/).

## Sources and method

This draft describes the School Atlas snapshot assembled on October 20, 2026. Ranking editions, rent years, tuition years, and community input years differ.

- [U.S. News public-school ranking publisher](https://www.usnews.com/education/best-high-schools/national-rankings).
- [HighSchoolTrends public rank tables](https://highschooltrends.org/atlas), the principal source for transcribed national positions.
- [Niche 2027 private-school ranking](https://www.niche.com/k12/search/best-private-high-schools/?page=1).
- [AARP Livability Index](https://livabilityindex.aarp.org/), the source of the six community categories.
- [HUD Small Area Fair Market Rents](https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html), the source of local three-bedroom rent benchmarks.
- [BLS 2024 household spending table](https://www.bls.gov/cex/tables/calendar-year/mean-item-share-average-standard-error/cu-size-2024.xlsx), the source of the household spending benchmarks.

The application contains the full formula, source links, admission audit, cost evidence, and comparison limits.
