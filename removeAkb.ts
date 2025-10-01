import { vectorDB } from './helpers/vectorStore';

async function _removeAkb(fieldName: string, fieldValue: string) {
    const filter = {
      must: [
        { key: fieldName, match: { value: fieldValue } }
      ]
    };
    const countRes = await vectorDB.count('kb_docs_v1', { filter, exact: true });

    console.log(`Found ${countRes.count} matching records to delete.`);
    const res = await vectorDB.delete('kb_docs_v1', { filter, wait: true });
    console.log(`Delete operation completed. Details:`, res);
}
// _removeAkb('fileName', 'Science_Info_Separation Anxiety_Parent_Strategies')