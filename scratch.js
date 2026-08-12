const SUPABASE_URL = "https://kxdijmgscsdukjvieamh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2qIUb1NHjj8LXsm9VKxndQ_-clZakRB";

async function fetchTable(table) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        }
    });
    const data = await res.json();
    console.log(`--- ${table} ---`);
    console.log(JSON.stringify(data, null, 2));
}

async function run() {
    await fetchTable('Reports');
    await fetchTable('Items');
    await fetchTable('Profiles');
}

run();
