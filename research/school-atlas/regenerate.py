"""Generate the frozen School Atlas artifacts without network retrieval."""
from pathlib import Path
import os
import subprocess
import sys
ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / 'research/school-atlas'
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
environment = {**os.environ, 'SCHOOL_ATLAS_OUTPUT_ROOT': str(OUTPUT), 'PYTHONDONTWRITEBYTECODE': '1'}
commands = [
    [sys.executable, str(RESEARCH / script)] for script in [
        'admissions-audit/build-cohort.py', 'build-cost-data.py',
        'admission-options/build-public-options.py', 'private-schools/build-private-data.py',
        'value-model/build.py', 'family-housing/build-housing.py', 'attendance-modes/build.py',
    ]
]
commands.extend([
    ['node', str(RESEARCH / 'private-schools/coverage/build-coverage.mjs')],
    ['node', str(RESEARCH / 'check-frozen.mjs')],
])
for command in commands:
    subprocess.run(command, cwd=ROOT, env=environment, check=True)
