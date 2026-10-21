from pathlib import Path
import json
import os
ROOT = Path(__file__).resolve().parents[3]
RESEARCH = ROOT / 'research/school-atlas'
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
model = json.loads((RESEARCH / 'value-model/model.json').read_text())
(OUTPUT / 'value-model.js').write_text('export default ' + json.dumps(model, ensure_ascii=False, separators=(',', ':')) + ';\n')
