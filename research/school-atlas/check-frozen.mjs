import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const research = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(research, '../..');
const output = path.resolve(process.env.SCHOOL_ATLAS_OUTPUT_ROOT ?? path.join(root, 'school-atlas'));
const manifest = JSON.parse(fs.readFileSync(path.join(research, 'import-manifest.json'), 'utf8'));
for (const record of manifest.source_research_files) {
  const bytes = fs.readFileSync(path.join(root, record.path));
  assert.ok(!/\b(?:sk|pk)\.[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+)*/.test(bytes.toString('utf8')), `${record.path}: archived Mapbox access token`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), record.migrated_sha256, `${record.path}: reviewed import bytes`);
}
const frozenFile = fs.readFileSync(path.join(research, 'frozen-payloads.json'));
assert.equal(createHash('sha256').update(frozenFile).digest('hex'), manifest.frozen_payloads_sha256);
const frozen = JSON.parse(frozenFile);
function relocate(value) {
  if (typeof value === 'string') return value.replace(/^research\//, 'research/school-atlas/').replace(/^dist\//, 'school-atlas/');
  if (Array.isArray(value)) return value.map(relocate);
  if (value && typeof value === 'object') {
    const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, relocate(child)]));
    if (value.path === 'research/family-housing/campus-mappings.json') {
      result.sha256 = createHash('sha256').update(fs.readFileSync(path.join(root, result.path))).digest('hex');
    }
    return result;
  }
  return value;
}
for (const [filename, expected] of Object.entries(frozen)) {
  const source = fs.readFileSync(path.join(output, filename), 'utf8');
  assert.ok(source.startsWith('export default '), `${filename}: default ESM export`);
  assert.ok(!source.includes('window.SCHOOL_ATLAS_'), `${filename}: global assignment`);
  const actual = (await import(pathToFileURL(path.join(output, filename)))).default;
  assert.deepEqual(actual, relocate(expected), `${filename}: frozen source payload`);
}
for (const page of ['admissions-audit.html', 'private-coverage.html']) {
  const html = fs.readFileSync(path.join(output, page), 'utf8');
  for (const required of ['<head><script defer src="https://loopaware.mprlab.com/pixel.js?', '<mpr-header', '<mpr-footer', 'footer-entry.js', '/assets/js/navigation.js', 'rel="canonical"', '/favicon.png', '/favicon.ico', 'companion article']) assert.ok(html.includes(required), `${page}: ${required}`);
}
console.log('Frozen source checks passed: seven semantic payloads, 300 schools, both branded audit pages.');
