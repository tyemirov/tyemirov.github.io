#!/usr/bin/env python3
"""Select the first 100 eligible ranks only after the entire prefix is resolved."""
import csv
import html
import json
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent.parent
import os
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
ranking = json.loads((HERE / "ranking-source/candidates-1-500.json").read_text())
candidates = {row["national_rank"]: row for row in ranking}
assert sorted(candidates) == list(range(1, 501))

def notes(row):
    return " ".join(dict.fromkeys(str(row[key]).strip() for key in
                                 ("caveats", "capacity_caveat", "evidence_limit")
                                 if row.get(key)))

ledger = {}
for path in sorted(HERE.glob("admissions-*.json")):
    for row in json.loads(path.read_text())["schools"]:
        rank = row["national_rank"]
        assert rank not in ledger, f"Duplicate audit rank {rank}"
        assert row["status"] in {"eligible", "excluded", "unresolved"}
        assert row["admissions_source_urls"] and row["evidence_summary"]
        assert row["school"] == candidates[rank]["school"], f"Identity mismatch {rank}"
        ledger[rank] = row
eligible = sorted(rank for rank, row in ledger.items() if row["status"] == "eligible")
assert len(eligible) >= 100, f"Only {len(eligible)} verified eligible schools"
selected = eligible[:100]
cutoff = selected[-1]
assert all(rank in ledger for rank in range(1, cutoff + 1)), "Missing prefix decisions"
pending = [rank for rank in range(1, cutoff + 1) if ledger[rank]["status"] == "unresolved"]
assert not pending, f"Unresolved ranks before cutoff: {pending}"
original = json.loads((HERE / "original-cohort.json").read_text())
old = {row["national_rank"]: row for row in original["schools"]}
enrichment_path = HERE / "new-school-enrichment.json"
enrichment = json.loads(enrichment_path.read_text()) if enrichment_path.exists() else {}
schools = []
for order, rank in enumerate(selected, 1):
    audit, candidate = ledger[rank], candidates[rank]
    row = dict(old.get(rank, enrichment.get(str(rank), {})))
    assert row, f"Missing enrichment record (null fields allowed): {rank}"
    row.update(
        national_rank=rank,
        school=candidate["school"],
        state=candidate["state"],
        eligible_cohort_order=order,
        ranking_edition="2026-2027",
        ranking_transcription_url=candidate["ranking_display_source_url"],
        ranking_profile_url=candidate["profile_url"],
        admissions_status="resident_boundary",
        admissions_source_url=audit["admissions_source_urls"][0],
        admissions_supporting_urls=audit["admissions_source_urls"][1:],
        admissions_evidence=audit["evidence_summary"],
        admissions_note=notes(audit),
        admissions_verified_on="2026-10-20",
    )
    corroboration = audit.get("rank_primary_source_url")
    if corroboration:
        row["ranking_primary_confirmation_urls"] = corroboration
    schools.append(row)
rank_divider = statistics.median(selected)
life_values = [s["quality_of_life_proxy"] for s in schools if s["quality_of_life_proxy"] is not None]
life_divider = statistics.median(life_values)
quadrants = {}
for s in schools:
    s["quadrant"] = (f'{"Upper" if s["eligible_cohort_order"] <= 50 else "Lower"} 50 in this cohort; '
                    + ("Livability unavailable" if s["quality_of_life_proxy"] is None else
                       f'{"Higher" if s["quality_of_life_proxy"] >= life_divider else "Lower"} livability'))
    quadrants[s["quadrant"]] = quadrants.get(s["quadrant"], 0) + 1
summary = dict(original["summary"], schools=100, unique_communities=len({s["community_geoid"] for s in schools}),
               school_rank_divider=rank_divider, national_rank_minimum=selected[0], national_rank_maximum=cutoff,
               livability_divider=life_divider, livability_minimum=min(life_values), livability_maximum=max(life_values),
               quadrants=quadrants, audit_cutoff=cutoff, audit_checked_on="2026-10-20",
               exact_primary_rank_confirmations=sum(bool(s["ranking_primary_confirmation_urls"]) for s in schools),
               locality_overrides=[s["national_rank"] for s in schools if s["locality_override"]])
(OUTPUT / "school-data.js").write_text("export default " + json.dumps({"schools": schools, "summary": summary}, ensure_ascii=False) + ";\n")
with (OUTPUT / "schools.csv").open("w", newline="") as f:
    fields = list(dict.fromkeys(key for row in schools for key in row))
    writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows({k: json.dumps(v) if isinstance(v, list) else v for k, v in row.items()} for row in schools)
audit_rows = []
for rank in range(1, cutoff + 1):
    row = dict(ledger[rank])
    row["caveats"] = notes(row)
    row.update(ranking_edition="2026-2027", ranking_source_url=candidates[rank]["ranking_display_source_url"],
               eligible_cohort_order=selected.index(rank) + 1 if rank in selected else "")
    audit_rows.append(row)
metadata = {
    "checked_on": "2026-10-20",
    "ranking_edition": "2026-2027",
    "ranking_provenance": "U.S. News national ranks republished by HighSchoolTrends. Complete primary publisher list inaccessible; source tables and API cross-checked, not independent primary verification.",
    "criterion": "Ordinary residential high-school entry into the ranked institution without a mandatory lottery or selective admission, including oversubscription lotteries. Optional selective programs may coexist; whole-school rank includes them.",
    "cutoff": cutoff, "included": 100, "excluded": cutoff - 100, "unresolved_before_cutoff": 0,
    "schools": audit_rows,
}
(OUTPUT / "admissions-audit.json").write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + "\n")
with (OUTPUT / "admissions-audit.csv").open("w", newline="") as f:
    fields = ["national_rank", "school", "state", "status", "eligible_cohort_order", "reason", "evidence_summary",
              "admissions_source_urls", "caveats", "ranking_edition", "ranking_source_url"]
    writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    writer.writerows({**row, "admissions_source_urls": " | ".join(row["admissions_source_urls"])} for row in audit_rows)
esc = html.escape
catalog = json.loads((ROOT / "data/site.json").read_text())
projects = [project for project in catalog["projects"] if project["slug"] == "school-atlas"]
assert len(projects) == 1, "Find one School Atlas project in data/site.json"
companion_url = projects[0]["sourceUrl"]
table_rows = []
for row in audit_rows:
    links = " · ".join(f'<a href="{esc(url, quote=True)}" target="_blank" rel="noopener noreferrer">Source {i}</a>'
                       for i, url in enumerate(row["admissions_source_urls"], 1))
    note = row.get("caveats") or row.get("evidence_limit", "")
    table_rows.append(f'<tr><td><a href="{esc(row["ranking_source_url"], quote=True)}" target="_blank" rel="noopener noreferrer">#{row["national_rank"]}</a></td><td><strong>{esc(row["school"])}</strong><br>{row["state"]}</td>'
                      f'<td>{"Included #" + str(row["eligible_cohort_order"]) if row["status"] == "eligible" else "Excluded"}</td>'
                      f'<td>{esc(row["evidence_summary"])}{"<p>" + esc(note) + "</p>" if note else ""}<br>{links}</td></tr>')
page = f"""<!doctype html><html lang="en"><head><script defer src="https://loopaware.mprlab.com/pixel.js?site_id=9b4c572e-44f4-40b3-8d25-a88d0dc6e16b&api_origin=https%3A%2F%2Floopaware-api.mprlab.com"></script><link rel="icon" type="image/png" href="/favicon.png"><link rel="icon" type="image/x-icon" href="/favicon.ico"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui.css"><script defer src="https://cdn.jsdelivr.net/gh/MarcoPoloResearchLab/mpr-ui@latest/mpr-ui.js"></script><link rel="stylesheet" href="/assets/css/footer.css"><link rel="canonical" href="https://tyemirov.net/school-atlas/admissions-audit.html"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>School Atlas · Admissions audit</title><link rel="stylesheet" href="styles.css">
<style>.audit-main{{max-width:1200px;margin:auto;padding:32px 24px}}.audit-table{{width:100%;border-collapse:collapse;font-size:14px}}.audit-table td,.audit-table th{{padding:14px 10px;border-bottom:1px solid #dce3df;text-align:left;vertical-align:top}}.audit-table td:last-child{{min-width:280px}}.audit-scroll{{overflow-x:auto}}.audit-intro{{max-width:850px;line-height:1.65;margin:28px 0}}.audit-table p{{margin:8px 0;color:#5c6865}}</style></head>
<body><mpr-header brand-label="School Atlas" brand-href="/school-atlas/" settings="false"></mpr-header><nav aria-label="Site"><a href="/">Home</a> · <a href="/school-atlas/">School Atlas</a> · <a href="{esc(companion_url, quote=True)}" target="_blank" rel="noopener noreferrer">Read companion article</a></nav><main class="audit-main"><a href="./">← School Atlas</a><div class="audit-intro"><p class="eyebrow">RANK-BY-RANK EVIDENCE · OCTOBER 20, 2026</p>
<h1>How the first 100 qualify</h1><p>Every national rank from #1 through #{cutoff} was reviewed: <strong>100 included, {cutoff-100} excluded, zero unresolved before the cutoff</strong>. Included-school positions #1–#100 are separate from national ranks.</p>
<p>{esc(metadata["criterion"])} A nonselective middle-school feeder alone does not qualify a school with selective entry at high-school level. Ordinary capacity overflow and address verification are recorded in each school's notes.</p>
<p><strong>Ranking source limitation:</strong> {esc(metadata["ranking_provenance"])} This is School Atlas's admission-filtered list, not a separate ranking issued by U.S. News. Missing livability or cost data never determines eligibility.</p>
<p><a href="admissions-audit.csv" download>Download audit CSV</a> · <a href="admissions-audit.json" download>Download complete audit JSON</a></p></div>
<div class="audit-scroll"><table class="audit-table"><thead><tr><th>National rank</th><th>School</th><th>Decision</th><th>Admission evidence</th></tr></thead><tbody>{''.join(table_rows)}</tbody></table></div></main><mpr-footer sticky="false" id="site-footer" class="site-footer"></mpr-footer><script type="module" src="/assets/js/navigation.js"></script><script type="module" src="/assets/js/footer-entry.js"></script></body></html>"""
(OUTPUT / "admissions-audit.html").write_text(page)
(HERE / "cohort-changes.json").write_text(json.dumps({"cutoff": cutoff, "added": sorted(set(selected)-set(old)),
                                                     "removed": sorted(set(old)-set(selected))}, indent=2) + "\n")
print(f"Selected first100 eligible through national#{cutoff}; complete prefix {cutoff} with zero unresolved.")
