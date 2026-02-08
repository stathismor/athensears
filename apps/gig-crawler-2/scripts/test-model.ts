#!/usr/bin/env tsx
/**
 * Test Gemini model availability
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("Error: GEMINI_API_KEY environment variable not set");
  process.exit(1);
}

const modelsToTry = [
  "gemini-1.5-flash-latest",
  "gemini-1.5-pro-latest",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-pro",
  "gemini-1.0-pro",
];

async function testModel(modelName: string) {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const result = await model.generateContent("Test: Return {\"status\": \"ok\"}");
    const response = result.response.text();

    console.log(`✓ ${modelName} - WORKS`);
    return true;
  } catch (error: any) {
    console.log(`✗ ${modelName} - ${error.status || error.message}`);
    return false;
  }
}

async function main() {
  console.log("Testing Gemini models...\n");

  for (const modelName of modelsToTry) {
    await testModel(modelName);
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
  }

  console.log("\nRecommendation: Use the first model that works (✓)");
  console.log("Update GEMINI_MODEL in your .env file");
}

main();
