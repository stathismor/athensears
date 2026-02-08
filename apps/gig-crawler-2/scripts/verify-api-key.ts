/**
 * Verify Gemini API key is valid
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = 'AIzaSyDAj6nMueA6-Z87HmPy8wi48sTS7Y5Uz9Q';

if (!apiKey) {
  console.error('❌ Error: GEMINI_API_KEY environment variable not set');
  console.error('\nTo get an API key:');
  console.error('1. Go to https://aistudio.google.com/apikey');
  console.error("2. Click 'Create API key'");
  console.error('3. Copy the key and add to .env');
  process.exit(1);
}

console.log('API Key format check:');
console.log(`  Length: ${apiKey.length} characters`);
console.log(`  Starts with: ${apiKey.substring(0, 10)}...`);

if (apiKey.length < 30) {
  console.error('\n❌ API key seems too short. Make sure you copied the full key.');
  process.exit(1);
}

console.log('\nTesting API key...');

async function testKey() {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Try the models/models endpoint which should work with any valid key
    const model = genAI.getGenerativeModel({ model: 'models/gemini-3-flash-preview' });

    const result = await model.generateContent('Say hello');
    const response = result.response;

    console.log('\n✅ API key is valid!');
    console.log('Response:', response.text().substring(0, 50) + '...');

    console.log("\n✓ You can use model: 'models/gemini-3-flash-preview'");
    console.log('\nUpdate your .env:');
    console.log('  GEMINI_MODEL=models/gemini-3-flash-preview');
  } catch (error: any) {
    console.error('\n❌ API key test failed:');
    console.error(`  Status: ${error.status}`);
    console.error(`  Message: ${error.message}`);

    console.error('\nPossible issues:');
    console.error('1. API key is invalid - regenerate at https://aistudio.google.com/apikey');
    console.error('2. Generative Language API not enabled');
    console.error("3. API key doesn't have permission for Gemini API");

    console.error('\nTo fix:');
    console.error('1. Go to https://aistudio.google.com/apikey');
    console.error('2. Create a new API key');
    console.error("3. Make sure 'Generative Language API' is enabled");
    console.error('4. Update GEMINI_API_KEY in .env');

    process.exit(1);
  }
}

testKey();
