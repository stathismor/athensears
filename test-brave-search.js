import axios from 'axios';

const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

if (!BRAVE_API_KEY) {
  console.error('Error: BRAVE_API_KEY environment variable not set');
  process.exit(1);
}

async function testBraveSearch() {
  try {
    const query = 'Rock/indie/Folk/dark συναυλίες Αθήνα';

    console.log(`\n🔍 Searching Brave for: "${query}"\n`);

    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
      params: {
        q: query,
        count: 20,
      },
    });

    const results = response.data.web?.results || [];

    console.log(`✅ Found ${results.length} results:\n`);

    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.title}`);
      console.log(`   URL: ${result.url}`);
      console.log(`   Description: ${result.description || 'N/A'}\n`);
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testBraveSearch();
