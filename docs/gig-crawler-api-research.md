# Gig Crawler API Research

Research completed: 2026-01-28

## Web Search API Options

### Option 1: SerpAPI (Recommended for Free Tier)
- **Free Tier**: 100 searches/month (no credit card required)
- **Pricing**: $75/month for 5,000 searches after free tier
- **Coverage**: 80+ search engines (Google, Bing, Baidu, Yandex)
- **Performance**: ~2ms average response time (fastest)
- **Best for**: Low-volume nightly crawls (30 searches/month easily fits free tier)
- **Setup**: Sign up at serpapi.com

### Option 2: Brave Search API (Best Value for Scale)
- **Free Tier**: None mentioned
- **Pricing**: $3-$5 per 1,000 searches
- **Coverage**: Independent Brave web index (not reliant on Google)
- **Performance**: Low latency, tuned to reduce SEO spam
- **Best for**: AI applications needing high-quality, fresh data
- **Setup**: Sign up at brave.com/search/api/

### Option 3: ScraperAPI
- **Free Tier**: 7-day trial with 5,000 credits
- **Pricing**: $149/month for 40,000 searches ($0.015/request)
- **Coverage**: Google only (but can scrape other sites like Amazon, Walmart)
- **Performance**: Slower than SerpAPI
- **Best for**: High-volume scraping with budget constraints

### Recommendation
**Start with SerpAPI free tier (100 searches/month)**. Running nightly searches for Athens gigs will use ~30-60 searches/month, well within the free limit. If you need more volume later, switch to Brave Search API for affordable scaling.

---

## LLM API Options

### Option 1: Groq (Recommended - Actually Free!)
- **Free Tier**: Yes, no credit card required
- **Pricing**: Free tier + Developer tier (10x rate limits, 25% discount) + Enterprise
- **Models**: Multiple open-source models (Llama, Mixtral, etc.)
- **Performance**: Extremely fast inference (uses custom LPU hardware)
- **Features**:
  - Batch API: 50% discount for async requests
  - Prompt caching: 50% savings on cache hits
- **Best for**: Production use with generous free tier
- **Setup**: Sign up at console.groq.com
- **Rate Limits**: Adequate for nightly crawls on free tier

### Option 2: Anthropic Claude API
- **Free Tier**: Small credits for testing only
- **Pricing**: Minimum $5 deposit, Tier 1 = $100/month limit
  - Haiku 4.5: $1 input / $5 output per 1M tokens (fast, efficient)
  - Sonnet 4.5: $3 input / $15 output per 1M tokens (balanced)
  - Opus 4.5: $5 input / $25 output per 1M tokens (flagship)
- **Features**:
  - Prompt caching: 90% savings
  - Batch API: 50% discount
- **Best for**: High-quality outputs, willing to pay
- **Limits**: 50 requests/min on Tier 1

### Option 3: OpenAI API
- **Free Tier**: None (removed in late 2025)
- **Pricing**: Requires prepayment, no free credits for new users
- **Models**: GPT-4, GPT-4 Turbo, GPT-3.5 Turbo
- **Features**: Batch API saves 50% with 24-hour processing
- **Best for**: Established projects with budget
- **Alternatives for free access**:
  - Researcher Access Program: $1,000 credits for university/research affiliations
  - Microsoft for Startups: $2,500 credits

### Recommendation
**Use Groq free tier**. It's genuinely free, fast, and has models capable of structured data extraction. For your use case (extracting gig data from web search results nightly), Groq's free tier will be more than sufficient.

---

## Final Architecture Recommendation

```
Nightly Crawler Service
├── Web Search: SerpAPI (100 free searches/month)
│   └── Query: "Athens Greece concerts [month]", "Athens live music events"
├── LLM Processing: Groq (free tier)
│   └── Extract structured gig data from search results
└── Store in Strapi CMS via API
```

**Monthly Cost**: $0 (within free tiers)

**Scaling Path**:
- If you exceed 100 searches/month: Switch to Brave Search API ($3-5/1000 searches)
- If Groq free tier is insufficient: Upgrade to Groq Developer tier or Anthropic Haiku ($1/1M input tokens)

---

## Next Steps

1. Sign up for SerpAPI account (get API key)
2. Sign up for Groq account (get API key)
3. Store API keys in environment variables
4. Proceed with Task #3 (Set up Node.js service)

---

## Sources

### Web Search APIs
- [Best SERP APIs in 2026](https://scrapfly.io/blog/posts/google-serp-api-and-alternatives)
- [Brave Search API](https://brave.com/search/api/)
- [5 Best Google Search API Providers](https://freerdps.com/blog/best-google-search-api/)
- [Best SerpAPI Alternative](https://www.scraperapi.com/comparisons/serpapi-alternative/)

### LLM APIs
- [Groq Free Tier Discussion](https://community.groq.com/t/is-there-a-free-tier-and-what-are-its-limits/790)
- [Groq Pricing](https://groq.com/pricing)
- [LLM API Pricing Comparison 2026](https://www.cloudidr.com/llm-pricing)
- [Anthropic Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [OpenAI API Pricing](https://openai.com/api/pricing/)
