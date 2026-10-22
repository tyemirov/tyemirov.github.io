# Private-school comparison source

`niche-2027-candidates.json` is the canonical 107-rank prefix. The builder excludes 7 online entries and selects the first 100campus schools through Niche publisher rank 107. Original publisher ranks and source-qualified identities are preserved; `private_cohort_order` records positions within this filtered view. `niche-2027-top100.json` and the four original page extracts remain historical source evidence.

`build-tuition.py` normalizes the original 100-rate audit. `build-private-data.py` applies the source-qualified community and cost corrections from `coverage/` and writes the current campus 100. Rebuild with `python research/private-schools/build-tuition.py`, `python research/private-schools/build-private-data.py`, and `node research/private-schools/coverage/build-coverage.cjs`.

Coverage has 100 AARP 2025 six-category scores,100 BEA 2024 prices (five state proxies),98 official tuition sources and 2 undated Niche tuition assumptions. Required expenses without amounts are preserved as open-ended costs/value ceilings. Modeled expense ranges remain intervals, with the conservative endpoint used for the graph dot. Conditional ceilings based on unverified tuition are distinguished. Thirteen schools have incomplete-cost ceilings; none is treated as a verified zero-fee cost. The one complete modeled expense range includes a disclosed four-year laptop amortization assumption. Boarding retains full household living spending near campus plus its published package, with no assumed household savings.

`coverage/before.json` preserves the previous 43missing cases. `coverage/after.json` records current coverage; the HTML/JSON audit is published in dist. Sources retain AARP, Census, BEA and official school evidence with hashes. Broader municipality/county proxies and state price proxies are visible. Friends Academy maps to Glen Cove rather than its Locust Valley postal label. Connecticut uses current planning-region county equivalents aligned to the 2023 metro delineation.

Run the calculator and catalog checks under `research/value-model/`. Public ranking cohorts and default public scores are unchanged.
