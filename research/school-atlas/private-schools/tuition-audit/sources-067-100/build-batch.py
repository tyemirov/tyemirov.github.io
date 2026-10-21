import pathlib,json
p=pathlib.Path(__file__).parent; root=p.parents[1]; schools=json.loads((root/'niche-2027-top100.json').read_text())['schools']; manifest={r['rank']:r for r in json.loads((p/'manifest.json').read_text())}
# Values are published full-price annual high-school tuition, using grade 12 when rates vary by high-school grade.
d={
67:(62000,'2026-2027',None,'Day students. Additional expenses estimated $1,000-$2,000 mix insurance, books, equipment, trips and optional lessons; no universal mandatory fee total published.'),
68:(28000,'2027-2028',None,'Local day tuition. Academic materials $850; yearbook $35; bus $1,500 includes $750 activity fee. Local total $30,385 includes bus/materials/yearbook; compulsory status of bus and separate activity amount unclear. Deposit $500 not annual core.'),
69:(42865,'2026-2027',0,'Tuition and fees include lunch, activity fees and technology. Upper School books estimated $700-$850 extra.'),
70:(55500,'2026-2027',435,'Grade 12 annual fee $350 plus Parents Association fee $85. Other grades: grade 9 $455, grade 10 $298, grade 11 $120, each plus $85. Course-related expenses vary $500-$900; optional lunch excluded.'),
71:(17000,'2026-2027',None,'Non-Nevada full-time high school tuition. Official Nevada residency waiver makes eligible NV tuition $0. Required books/lab kits and computer/internet extra, amount unspecified. $60 personalized-tuition application fee excluded.'),
72:(40950,'2026-2027',700,'Annual technology/capital fee $340 plus mandatory activity fee $360. One-time new-student fee $200 excluded. $3,000 deposit credited to tuition. Paid-in-full plan: refund insurance optional; split/monthly plans require $1,520 refund plan; monthly adds $650 processing. Books and supplies extra.'),
73:(70890,'2026-2027',None,'Lunch, yearbook, textbooks and accident insurance included. Course supplies, required trips, athletic fees and computers/internet extra with no universal amount published.'),
74:(72070,'2026-2027',None,'Annual all-grade tuition. Current official tuition page does not itemize a universal recurring fee total.'),
75:(39500,'current-undated',0,'Full-price upper end of official $11,800-$39,500 sliding scale; reduced tuition is family-specific. Curriculum/books/testing, platform and transcript included. $50 application fee credited to tuition. Current page gives no academic-year label.'),
76:(41500,'2026-2027',3500,'Upper School day tuition $41,500 plus day food service $2,500 and facilities use $1,000 gives published total $45,000. Books/supplies additional estimated $500-$800; optional academies and lessons excluded.'),
77:(38070,'2026-2027',3350,'Grade 12 International-program basis: annual registration $250, capital building $1,250, IB fee $1,100 and senior fee $750. French Terminale registration/exam $310-$600 instead of IB fee; grades 10/11 activity-trip fees vary $250-$6,000. Books and uniforms extra. One-time new student $1,500 and application $200 excluded.'),
78:(68600,'2026-2027',0,'Published tuition includes snacks/lunch, most field trips/class retreats, transportation, PE uniform and Family Association membership. Upper School books/materials $600-$800 annually, laptop up to $1,500 extra.'),
79:(None,'2027-2028',None,'Residential UWC-USA publishes $59,800 tuition but no equivalent day-student rate; retain as boarding cost only.'),
80:(51500,'2026-2027',0,'School says tuition is virtually all-inclusive, including books and lunch; only uncovered school cost identified is optional contracted transportation. Optional refund insurance $585 excluded.'),
81:(68475,'2026-2027',2815,'Published total cost of enrollment $71,290 includes $68,475 tuition plus lunch and all other required fees. Deposit 10% credited toward tuition.'),
82:(57069,'2026-2027',None,'Upper School books/supplies $325-$875; athletics uniform and required spirit wear $250 for Forms III/IV; laptop if needed $1,000-$2,000; meal plan/transport additional. No universal grade 12 mandatory recurring fee amount identified.'),
83:(58541,'2026-2027',0,'Tuition includes field trips, experiential/outdoor education and athletic fees. One-time new-student enrollment $3,400 excluded. Upper School books $250-$750 and family-supplied laptop additional; bus optional.'),
84:(57000,'2026-2027',400,'Day fee covers tuition, study rooms and Monday-Saturday meals. Refund plan required: paid-in-full $400 (0.7%); two/ten-payment $800 (1.4%). Additional art/music/testing/trip charges vary; schedule on request.'),
85:(22500,'current-undated',None,'Annual full-time 1-on-1 US K-12 two-semester program, six academic courses. Additional AP tuition not specified. Separate $10,450 small-group plan explicitly for TEFA students; no universal eligibility assumed. Current pricing page gives no year label.'),
86:(37500,'2026-2027',None,'Grades 9-12. One-time new-student fee $3,000 excluded. Textbooks estimated $500-$700 per year; insurance required only for aid recipients, annual premium $178-$233.'),
87:(44470,'2026-2027',275,'Upper School annual activity $210 plus Parents Association $65 per family. Books purchased separately and some field trips billed separately; no exact universal total for those.'),
88:(39810,'2026-2027',None,'School estimates books, athletic gear and fees together at approximately $1,000 each year; no exact recurring-fee component separated.'),
89:(51156,'2026-2027',None,'Published all-grade tuition. Books, laptop, lunch, Project Week and transportation are separate school-related costs; official aid page does not itemize universal mandatory annual fee total.'),
90:(66700,'2026-2027',None,'Day tuition; international student fee $3,000 applies only to international students, excluded from domestic day basis. No universal recurring fee total published on tuition page.'),
91:(61895,'2026-2027',0,'Upper School tuition includes lunch, technology/laboratory fees and essential trips. Textbooks/supplies and optional activities additional. Five-day boarding $18,905 excluded. Deposit credited tuition.'),
92:(54980,'2026-2027',None,'Day tuition includes instruction, on-campus events and lunch except Sundays. School describes additional expenses; no universal annual mandatory fee total identified.'),
93:(66400,'2026-2027',475,'Grades 9-12 tuition $66,400 plus explicitly mandatory High School activity fee $475.'),
94:(36240,'2026-2027',0,'Published Upper School tuition/fee schedule. One-time new-student registration $1,000 excluded. Books $500-$800 and grade-9 trip approximately $450 extra; no universal annual grade-12 additional school fee listed.'),
95:(50300,'2026-2027',None,'Required/variable costs list EBC Week trips $575-$6,600 depending on choice, books/supplies $200-$750, laptop $2,590 once every four years (2026-27 update pending). No fixed annual mandatory trip total.'),
96:(None,'2025-2026',None,'All-boarding boys school. Published $72,300 includes room, board and all school activities; no day tuition exists.'),
97:(44000,'2026-2027',0,'Official page explicitly says no other charges except necessary books and a few personal athletic supplies.'),
98:(46825,'2026-2027',None,'Grades 9-12 tuition. Official page says additional fees apply, without itemizing amounts or compulsory applicability.'),
99:(41856,'2026-2027',None,'Grade 12 tuition. Other Upper School rates: grade 9 $42,697, grades 10/11 $40,068. No universal annual fee total itemized on official tuition page.'),
100:(27800,'2026-2027',1000,'Form VIII (grade 12) annual tuition $27,800 plus $1,000 registration; published total $28,800. Forms V-VII tuition $27,400 plus $1,000 registration. Other purchases/activities may vary.')}
override={71:'https://www.davidsononline.org/admissions/tuition-and-aid/',73:'https://www.ecfs.org/admissions/tuition-and-financial-aid/',75:'https://www.aeonschool.org/tuition-and-affordability',85:'https://www.tcsglobal.org/pricing-plans/tcsp',93:'https://saintannsny.org/admissions/tuition/',97:'https://www.roxburylatin.org/admission/tuition/'}
rows=[]
for s in schools[66:100]:
 k=s['private_rank'];t,y,f,n=d[k];url=override.get(k,manifest.get(k,{}).get('url'))
 row={'school_id':s['school_id'],'private_rank':k,'school_name':s['school_name'],'status':'boarding_only' if k in (79,96) else 'verified','tuition_usd':t,'tuition_year':y,'tuition_basis':('boarding only; no comparable day rate' if k in (79,96) else 'full-time online high school before aid' if k in (71,75,85) else 'annual high-school day tuition before aid; grade 12 where grade-dependent'),'source_url':url,'source_title':s['school_name']+' — official tuition and fees','evidence_summary':('Official school page publishes the stated rate for the stated basis. '+n),'mandatory_recurring_fees_usd':f,'fees_note':n,'verified_on':'2026-10-20','source_snapshot':f'sources-067-100/{k:03}.txt' if (p/f'{k:03}.txt').exists() else 'sources-067-100/indexed-sources.json'}
 if k in (69,72,76,78,80,81,83,87,91,93,97,100):row['fees_complete']=True
 if k in (68,73,95):row['required_fee_total_unresolved']=True
 if k==71:
  row['nevada_resident_tuition_usd']=0
  row['source_snapshot']='sources-067-100/final-web-sources.json'
 if k==75:row['tuition_min_usd']=11800
 if k==79:row['boarding_tuition_usd']=59800
 if k==96:row['boarding_tuition_usd']=72300
 if k in (70,77,99,100):row['grade_basis']='12'
 rows.append(row)
assert len(rows)==34 and [r['private_rank'] for r in rows]==list(range(67,101))
out={'scope':'Niche private ranks 67-100; annual full-price high-school day tuition, grade 12 where grade dependent','retrieved_on':'2026-10-20','rows':rows}
(p.parent/'batch-067-100.json').write_text(json.dumps(out,indent=2)+'\n');print('Wrote',len(rows),'rows;',sum(r['status']=='verified' for r in rows),'verified;',sum(r['status']=='boarding_only' for r in rows),'boarding only')
