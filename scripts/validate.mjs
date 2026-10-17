import {readSource} from './io.mjs';
const s=await readSource();console.log(`Validated ${s.objects.length} objects, ${s.relationships.length} connections, ${s.sources.length} sources and ${s.notes.length} notes.`);
