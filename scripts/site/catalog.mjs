// @ts-check
import { readFile, writeFile } from 'node:fs/promises';
import { validateSourceCatalog, publishCatalog } from '../../assets/js/catalog.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Supply source and public catalog paths.');
const source = validateSourceCatalog(JSON.parse(await readFile(input, 'utf8')));
await writeFile(output, JSON.stringify(publishCatalog(source), null, 2) + '\n');
