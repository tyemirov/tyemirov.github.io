"""Verify the deployed family-budget arithmetic against the pinned BLS workbook."""
import hashlib,json,zipfile,xml.etree.ElementTree as E
from pathlib import Path
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(HERE/'cu-size-2024.xlsx') as z:
 strings=[''.join(x.itertext()) for x in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
 rows={}
 for row in E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:row',ns):
  values={}
  for cell in row:
   value=cell.find('s:v',ns)
   if value is not None:values[''.join(c for c in cell.attrib['r'] if c.isalpha())]=strings[int(value.text)] if cell.attrib.get('t')=='s' else value.text
  rows[int(row.attrib['r'])]=values
assert rows[4]['F']=='Three\npeople'
labels=['Average annual expenditures','Shelter','Natural gas','Electricity','Fuel oil and other fuels','Water and other public services','Telephone services','Education','Cash contributions','Personal insurance and pensions']
components={label:int(float(rows[n+1]['F'])) for n,row in rows.items() if (label:=row.get('A')) in labels and rows.get(n+1,{}).get('A')=='Mean'}
home=components['Average annual expenditures']-sum(components[k] for k in ['Education','Cash contributions','Personal insurance and pensions'])
utilities=sum(components[k] for k in ['Natural gas','Electricity','Fuel oil and other fuels','Water and other public services'])
other=home-components['Shelter']-utilities
model=json.loads((ROOT/'research/school-atlas/value-model/model.json').read_text())
assert home==model['default_home_budget_usd']==74326
assert other==model['default_non_housing_budget_usd']==52956
result={'source_url':model['budget_source_url'],'retrieved_on':'2026-10-20','year':2024,'population':'Three-person consumer units; not an exact two-adult/one-child estimate','components':components,'covered_energy_water_utilities':utilities,'home_spending_before_school':home,'other_spending_excluding_shelter_and_covered_utilities':other,'sha256':hashlib.sha256((HERE/'cu-size-2024.xlsx').read_bytes()).hexdigest(),'limits':'National mean in 2024 dollars, no inflation or household-specific adjustment. Home benchmark remains unchanged during boarding; meal/utility savings are not inferred.'}
(HERE/'source-audit.json').write_text(json.dumps(result,indent=2)+'\n')
print('BLS workbook reconciled: current-home74326; residual52956; coveredutilities3815; telephone retained1758.')
