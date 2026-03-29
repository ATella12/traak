export type Market = {
  slug: string;
  question: string;
  category: string;
};

export const categories: string[] = [
  "Politics",
  "Sports",
  "Crypto",
  "Business",
  "Tech",
  "Pop Culture",
  "World",
  "US",
  "Elections",
  "Finance",
  "Science",
  "Other",
];

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const toCategorySlug = (category: string): string => slugify(category);

export const fromCategorySlug = (slug: string): string | undefined =>
  categories.find((category) => toCategorySlug(category) === slug);

export const markets: Market[] = [
  { slug: "house-speaker-before-july", question: "Will the US House have a new Speaker before July?", category: "Politics" },
  { slug: "senate-budget-deal-by-september", question: "Will the Senate pass a budget deal by September?", category: "Politics" },
  { slug: "federal-shutdown-in-2026", question: "Will there be a federal shutdown in 2026?", category: "Politics" },
  { slug: "major-cabinet-resignation-2026", question: "Will a major cabinet official resign in 2026?", category: "Politics" },
  { slug: "new-us-sanctions-on-iran-2026", question: "Will the US announce new sanctions on Iran in 2026?", category: "Politics" },
  { slug: "uk-pm-confidence-vote-2026", question: "Will the UK Prime Minister face a confidence vote in 2026?", category: "Politics" },
  { slug: "france-pension-reform-expanded", question: "Will France expand pension reforms this year?", category: "Politics" },
  { slug: "canada-snap-election-2026", question: "Will Canada call a snap federal election in 2026?", category: "Politics" },
  { slug: "un-security-resolution-middle-east", question: "Will a UN Security Council resolution pass on Middle East ceasefire terms?", category: "Politics" },
  { slug: "nato-defense-spending-target-20", question: "Will 20+ NATO members hit defense-spending targets this year?", category: "Politics" },

  { slug: "chiefs-win-afc-west-2026", question: "Will the Chiefs win the AFC West in 2026?", category: "Sports" },
  { slug: "lakers-playoff-spot-2026", question: "Will the Lakers secure a playoff spot in 2026?", category: "Sports" },
  { slug: "man-city-win-epl-2025-26", question: "Will Manchester City win the EPL 2025-26 season?", category: "Sports" },
  { slug: "arsenal-top-4-finish-2025-26", question: "Will Arsenal finish top 4 in EPL 2025-26?", category: "Sports" },
  { slug: "messi-club-world-cup-goal", question: "Will Messi score in the Club World Cup?", category: "Sports" },
  { slug: "wimbledon-womens-new-champion", question: "Will Wimbledon women’s singles have a first-time champion this year?", category: "Sports" },
  { slug: "yankees-95-wins-2026", question: "Will the Yankees win 95+ regular season games in 2026?", category: "Sports" },
  { slug: "dodgers-world-series-2026", question: "Will the Dodgers win the World Series in 2026?", category: "Sports" },
  { slug: "celtics-60-wins-2026", question: "Will the Celtics finish with 60+ wins in 2026?", category: "Sports" },
  { slug: "f1-verstappen-title-2026", question: "Will Max Verstappen win the 2026 F1 Drivers title?", category: "Sports" },

  { slug: "btc-ath-2026", question: "Will Bitcoin hit a new all-time high in 2026?", category: "Crypto" },
  { slug: "eth-5000-before-2027", question: "Will ETH trade above $5,000 before 2027?", category: "Crypto" },
  { slug: "sol-above-300-2026", question: "Will SOL trade above $300 in 2026?", category: "Crypto" },
  { slug: "doge-etf-filed-2026", question: "Will a DOGE ETF be formally filed in 2026?", category: "Crypto" },
  { slug: "us-stablecoin-bill-passes-2026", question: "Will the US pass a federal stablecoin bill in 2026?", category: "Crypto" },
  { slug: "base-top2-l2-tvl-2026", question: "Will Base rank top-2 among L2s by TVL in 2026?", category: "Crypto" },
  { slug: "bnb-over-900-2026", question: "Will BNB trade above $900 in 2026?", category: "Crypto" },
  { slug: "xrp-etf-approved-2026", question: "Will an XRP ETF be approved in 2026?", category: "Crypto" },
  { slug: "ai-token-sector-outperform-2026", question: "Will AI tokens outperform BTC in 2026 YTD?", category: "Crypto" },
  { slug: "total-crypto-mcap-6t-2026", question: "Will total crypto market cap exceed $6T in 2026?", category: "Crypto" },

  { slug: "apple-revenue-growth-q4", question: "Will Apple report YoY revenue growth next Q4?", category: "Business" },
  { slug: "tesla-deliveries-above-2m-2026", question: "Will Tesla deliveries exceed 2M units in 2026?", category: "Business" },
  { slug: "amazon-cloud-growth-20", question: "Will AWS quarterly growth exceed 20% this year?", category: "Business" },
  { slug: "openai-new-enterprise-tier-2026", question: "Will OpenAI launch a new enterprise pricing tier in 2026?", category: "Business" },
  { slug: "netflix-subs-350m-2026", question: "Will Netflix exceed 350M global subscribers by end of 2026?", category: "Business" },
  { slug: "uber-first-dividend-2026", question: "Will Uber announce its first dividend in 2026?", category: "Business" },
  { slug: "stripe-ipo-2026", question: "Will Stripe IPO in 2026?", category: "Business" },
  { slug: "spac-deals-above-150-2026", question: "Will SPAC deal count exceed 150 in 2026?", category: "Business" },
  { slug: "starlink-spinout-announced-2026", question: "Will a Starlink spinout be announced in 2026?", category: "Business" },
  { slug: "largest-mna-deal-over-80b-2026", question: "Will the largest 2026 M&A deal exceed $80B?", category: "Business" },

  { slug: "apple-ai-phone-feature-2026", question: "Will Apple ship a major on-device AI phone feature in 2026?", category: "Tech" },
  { slug: "nvidia-4t-market-cap-2026", question: "Will Nvidia reach a $4T market cap in 2026?", category: "Tech" },
  { slug: "meta-open-source-frontier-model-2026", question: "Will Meta release a frontier open-source model in 2026?", category: "Tech" },
  { slug: "google-gemini-200m-users-2026", question: "Will Gemini products reach 200M MAUs in 2026?", category: "Tech" },
  { slug: "microsoft-copilot-paid-100m-2026", question: "Will Microsoft Copilot paid users exceed 100M in 2026?", category: "Tech" },
  { slug: "tesla-robotaxi-expanded-us", question: "Will Tesla robotaxi service expand to 5+ US cities this year?", category: "Tech" },
  { slug: "vision-pro-v2-launch-2026", question: "Will Apple launch Vision Pro v2 in 2026?", category: "Tech" },
  { slug: "consumer-humanoid-ship-2026", question: "Will a consumer humanoid robot ship in 2026?", category: "Tech" },
  { slug: "x-platform-banking-feature-2026", question: "Will X launch US in-app banking features in 2026?", category: "Tech" },
  { slug: "github-ai-prs-majority-2026", question: "Will AI-generated PRs exceed 50% on GitHub in 2026?", category: "Tech" },

  { slug: "taylor-new-album-2026", question: "Will Taylor Swift release a new studio album in 2026?", category: "Pop Culture" },
  { slug: "drake-tour-announcement-2026", question: "Will Drake announce a world tour in 2026?", category: "Pop Culture" },
  { slug: "marvel-film-over-1b-2026", question: "Will a Marvel movie gross over $1B in 2026?", category: "Pop Culture" },
  { slug: "gta6-delay-again", question: "Will GTA 6 be delayed again?", category: "Pop Culture" },
  { slug: "netflix-most-watched-series-new", question: "Will Netflix's most-watched 2026 series be a new IP?", category: "Pop Culture" },
  { slug: "oscar-best-picture-streaming-2026", question: "Will a streaming-first film win Best Picture in 2026?", category: "Pop Culture" },
  { slug: "billie-eilish-grammy-2026", question: "Will Billie Eilish win a Grammy in 2026?", category: "Pop Culture" },
  { slug: "new-kpop-group-billboard-top10", question: "Will a new K-pop group reach Billboard Top 10 this year?", category: "Pop Culture" },
  { slug: "youtube-creator-hit-200m-subs", question: "Will any creator hit 200M YouTube subscribers in 2026?", category: "Pop Culture" },
  { slug: "streaming-sports-doc-breakout-2026", question: "Will a sports doc be the top global streaming title in 2026?", category: "Pop Culture" },

  { slug: "g20-new-climate-pledge-2026", question: "Will G20 adopt a new climate pledge in 2026?", category: "World" },
  { slug: "ceasefire-gaza-before-july", question: "Will a sustained Gaza ceasefire begin before July?", category: "World" },
  { slug: "taiwan-major-election-shift", question: "Will Taiwan see a major coalition shift this year?", category: "World" },
  { slug: "argentina-inflation-under-25-2026", question: "Will Argentina inflation fall below 25% by end of 2026?", category: "World" },
  { slug: "india-gdp-growth-over-7-2026", question: "Will India GDP growth exceed 7% in 2026?", category: "World" },
  { slug: "japan-rate-hike-twice-2026", question: "Will Japan raise rates at least twice in 2026?", category: "World" },
  { slug: "china-stimulus-package-over-1t", question: "Will China announce stimulus exceeding $1T equivalent this year?", category: "World" },
  { slug: "eu-enlargement-step-2026", question: "Will the EU complete a formal enlargement milestone in 2026?", category: "World" },
  { slug: "global-oil-over-110-2026", question: "Will Brent crude trade above $110 in 2026?", category: "World" },
  { slug: "global-temp-anomaly-record-2026", question: "Will 2026 set a new global temperature anomaly record?", category: "World" },

  { slug: "us-recession-2026", question: "Will the US enter recession in 2026?", category: "US" },
  { slug: "fed-rate-cut-before-september", question: "Will the Fed cut rates before September?", category: "US" },
  { slug: "cpi-below-2-5-2026", question: "Will US CPI drop below 2.5% in 2026?", category: "US" },
  { slug: "unemployment-over-5-2026", question: "Will US unemployment exceed 5% in 2026?", category: "US" },
  { slug: "supreme-court-major-tech-case-2026", question: "Will the Supreme Court decide a major tech antitrust case in 2026?", category: "US" },
  { slug: "national-gas-average-under-3", question: "Will US average gas price fall below $3 this year?", category: "US" },
  { slug: "housing-starts-over-1-7m-2026", question: "Will US housing starts exceed 1.7M annualized in 2026?", category: "US" },
  { slug: "student-loan-relief-expansion-2026", question: "Will student loan relief expand in 2026?", category: "US" },
  { slug: "new-federal-ai-regulation-2026", question: "Will new federal AI regulation pass in 2026?", category: "US" },
  { slug: "us-gdp-q4-over-2-5", question: "Will US Q4 GDP growth print above 2.5%?", category: "US" },

  { slug: "democrat-win-popular-vote-2028", question: "Will Democrats win the 2028 popular vote?", category: "Elections" },
  { slug: "republican-flip-senate-2028", question: "Will Republicans flip the Senate in 2028?", category: "Elections" },
  { slug: "third-party-over-5pct-2028", question: "Will a third-party candidate get over 5% in 2028?", category: "Elections" },
  { slug: "first-primary-dropout-before-super-tuesday", question: "Will a top-tier primary candidate drop out before Super Tuesday?", category: "Elections" },
  { slug: "first-female-vp-nominee-gop-2028", question: "Will GOP nominate a female VP candidate in 2028?", category: "Elections" },
  { slug: "swing-state-recount-2028", question: "Will any swing state require a recount in 2028?", category: "Elections" },
  { slug: "debate-cancelled-2028", question: "Will a general election debate be canceled in 2028?", category: "Elections" },
  { slug: "turnout-over-67-2028", question: "Will 2028 voter turnout exceed 67%?", category: "Elections" },
  { slug: "new-york-mayor-incumbent-loses", question: "Will NYC mayoral incumbent lose next election?", category: "Elections" },
  { slug: "california-ballot-ai-law-passes", question: "Will California pass a statewide AI ballot measure?", category: "Elections" },

  { slug: "sp500-close-above-6500-2026", question: "Will S&P 500 close above 6500 in 2026?", category: "Finance" },
  { slug: "nasdaq-new-high-2026", question: "Will Nasdaq hit a new all-time high in 2026?", category: "Finance" },
  { slug: "gold-over-3000-2026", question: "Will gold trade above $3,000 in 2026?", category: "Finance" },
  { slug: "10y-yield-over-5-2026", question: "Will US 10Y yield exceed 5% in 2026?", category: "Finance" },
  { slug: "vix-over-40-2026", question: "Will VIX spike above 40 in 2026?", category: "Finance" },
  { slug: "usd-index-under-95-2026", question: "Will DXY fall below 95 in 2026?", category: "Finance" },
  { slug: "oil-ends-year-above-100-2026", question: "Will oil end 2026 above $100?", category: "Finance" },
  { slug: "fed-balance-sheet-up-2026", question: "Will Fed balance sheet expand in 2026?", category: "Finance" },
  { slug: "private-credit-defaults-over-4", question: "Will private credit defaults exceed 4% this year?", category: "Finance" },
  { slug: "us-banks-chargeoffs-rise-2026", question: "Will large US banks report higher charge-offs in 2026?", category: "Finance" },

  { slug: "spacex-starship-orbit-2026", question: "Will Starship complete 3+ orbital missions in 2026?", category: "Science" },
  { slug: "nasa-artemis-crew-launch-2026", question: "Will NASA launch a crewed Artemis mission in 2026?", category: "Science" },
  { slug: "fusion-net-energy-repeatable-2026", question: "Will fusion net-energy gain be replicated commercially in 2026?", category: "Science" },
  { slug: "fda-approves-alzheimers-drug-2026", question: "Will FDA approve a new Alzheimer's drug in 2026?", category: "Science" },
  { slug: "gene-editing-cure-approval-2026", question: "Will a gene-editing cure get expanded approval in 2026?", category: "Science" },
  { slug: "largest-ever-neutrino-detection-2026", question: "Will scientists report a record neutrino detection in 2026?", category: "Science" },
  { slug: "moon-water-commercial-rights-2026", question: "Will commercial moon-water extraction rights be granted in 2026?", category: "Science" },
  { slug: "major-quantum-breakthrough-2026", question: "Will a major quantum error-correction milestone be announced in 2026?", category: "Science" },
  { slug: "global-measles-cases-down-2026", question: "Will global measles cases decline YoY in 2026?", category: "Science" },
  { slug: "new-particle-claim-lhc-2026", question: "Will CERN publish evidence of a new particle in 2026?", category: "Science" },

  { slug: "olympics-host-announcement-2036", question: "Will the 2036 Olympics host be announced this year?", category: "Other" },
  { slug: "major-cyberattack-us-grid-2026", question: "Will a major cyberattack disrupt a US grid operator in 2026?", category: "Other" },
  { slug: "atlantic-hurricane-category5-landfall", question: "Will a Category 5 hurricane make Atlantic landfall this year?", category: "Other" },
  { slug: "new-pandemic-alert-2026", question: "Will WHO issue a new pandemic-level alert in 2026?", category: "Other" },
  { slug: "ufo-hearing-prime-time-2026", question: "Will there be a prime-time congressional UFO hearing in 2026?", category: "Other" },
  { slug: "largest-lottery-jackpot-over-2b", question: "Will any lottery jackpot exceed $2B this year?", category: "Other" },
  { slug: "new-supersonic-passenger-test-2026", question: "Will a new supersonic passenger jet complete a full test flight in 2026?", category: "Other" },
  { slug: "global-airline-passengers-record-2026", question: "Will global airline passenger volume set a new record in 2026?", category: "Other" },
  { slug: "major-streaming-price-war-2026", question: "Will two major streamers cut prices in the same quarter in 2026?", category: "Other" },
  { slug: "world-record-marathon-under-2h01", question: "Will the official marathon world record drop below 2:01 this year?", category: "Other" },
];

export const getMarketsByCategory = (category: string): Market[] =>
  markets.filter((market) => market.category === category);

export const getMarketByCategoryAndSlug = (
  category: string,
  slug: string,
): Market | undefined => markets.find((market) => market.category === category && market.slug === slug);
