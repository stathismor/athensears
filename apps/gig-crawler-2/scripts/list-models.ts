#!/usr/bin/env tsx
/**
 * List available Gemini models for your API key
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("Error: GEMINI_API_KEY environment variable not set");
  console.error("Usage: GEMINI_API_KEY=your_key tsx scripts/list-models.ts");
  process.exit(1);
}

async function listModels() {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    console.log("Fetching available models...\n");

    const models = await genAI.listModels();

    console.log("Available models:");
    console.log("=================\n");

    for await (const model of models) {
      console.log(`Model: ${model.name}`);
      console.log(`  Display Name: ${model.displayName}`);
      console.log(`  Description: ${model.description}`);
      console.log(`  Supported Methods: ${model.supportedGenerationMethods?.join(", ")}`);
      console.log();
    }

    console.log("\nRecommended models for gig-crawler-2:");
    console.log("  - gemini-1.5-flash-latest (fast, cheap)");
    console.log("  - gemini-1.5-pro-latest (better quality, more expensive)");
    console.log("  - gemini-pro (older, but stable)");

  } catch (error) {
    console.error("Error fetching models:", error);
    process.exit(1);
  }
}

listModels();
