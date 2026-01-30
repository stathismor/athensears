#!/bin/bash

# Test Brave AI Grounding API directly
# This will show us exactly what the API returns

echo "Testing Brave AI Grounding API..."
echo "================================"
echo ""

curl -X POST "https://api.search.brave.com/res/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "x-subscription-token: BSAEm371aFR919RvhSreulcQ1XHoPjP" \
  -d '{
    "model": "brave",
    "messages": [
      {
        "role": "user",
        "content": "Find 2-3 upcoming live music events in Athens, Greece in January 2026. For each event, return JSON with: title, date (ISO format), venue name, price. Return ONLY a JSON array."
      }
    ],
    "stream": false
  }' | jq '.' > /tmp/brave-response.json

echo ""
echo "Response saved to /tmp/brave-response.json"
echo ""
echo "Full response:"
cat /tmp/brave-response.json

echo ""
echo ""
echo "Just the message content:"
cat /tmp/brave-response.json | jq -r '.choices[0].message.content'
