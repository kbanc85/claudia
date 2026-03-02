/**
 * Entity extraction for Claudia CLI.
 * Port of memory-daemon/claudia_memory/extraction/entity_extractor.py.
 *
 * Regex-only extraction (no spaCy dependency in Node.js).
 * Extracts people, organizations, projects, locations, commitments, preferences.
 */

// ----- Regex Patterns -----

const PERSON_PATTERNS = [
  /\b(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
  /\b([A-Z][a-z]+)'s\b/g,
  /\b(?:with|from|to|about|called|named|meet(?:ing)?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
];

const ORGANIZATION_PATTERNS = [
  /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Inc\.?|Corp\.?|LLC|Ltd\.?|Co\.?|Company|Group|Partners|Consulting))\b/g,
  /\b([A-Z]{2,5})\b(?:\s+(?:team|company|client|project))?/g,
];

const PROJECT_PATTERNS = [
  /\b(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:project|initiative|proposal|deal)\b/gi,
  /\b(Q[1-4]\s+[A-Za-z]+)\b/g,
];

const COMMITMENT_PATTERNS = [
  /(?:I'll|I will|I'm going to|we'll|we will)\s+(.+?)(?:\.|$)/gi,
  /(?:by|before|until)\s+(\w+day|\d+[/-]\d+|\w+\s+\d+)/gi,
  /(?:send|deliver|complete|finish|submit)\s+(?:the\s+)?(.+?)(?:\s+(?:by|to|before)|\.|$)/gi,
];

const PREFERENCE_PATTERNS = [
  /(?:I |he |she |they )(?:prefer|like|want|need)\s+(.+?)(?:\.|$)/gi,
  /(?:better|best|rather)\s+(?:to |if |when )?(.+?)(?:\.|$)/gi,
];

const GEOGRAPHY_PATTERNS = [
  /(?:based in|from|lives in|located in|residing in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
  /\b([A-Z][a-z]+),\s*([A-Z]{2})\b/g,
  /\b([A-Z][a-z]+),\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/g,
];

const ROLE_PATTERNS = [
  /\b(CEO|CFO|CTO|COO|CMO|CIO|VP|President|Director|Manager|Partner|Founder|Co-founder|Chairman|Board Member|Advisor|Consultant|Principal|Associate|Analyst|Engineer|Developer)\s*(?:of|at|for)?\b/gi,
  /(?:works as|serves as|role is|position is|title is)\s+(?:a\s+)?([A-Za-z\s]+?)(?:\s+at|\s+for|\.|,|$)/gi,
];

const COMMUNITY_PATTERNS = [
  /(?:member of|part of|belongs to|joined|active in)\s+(?:the\s+)?([A-Za-z\s]+?)(?:\s+(?:chapter|group|club|organization|network))?(?:\.|,|$)/gi,
  /(?:on the board of|board member of|serves on)\s+(?:the\s+)?([A-Za-z\s]+?)(?:\.|,|$)/gi,
];

// ----- Reference Sets -----

const MAJOR_CITIES = new Set([
  'new york', 'los angeles', 'chicago', 'houston', 'phoenix',
  'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose',
  'austin', 'jacksonville', 'fort worth', 'columbus', 'charlotte',
  'san francisco', 'indianapolis', 'seattle', 'denver', 'boston',
  'el paso', 'nashville', 'detroit', 'portland', 'las vegas',
  'miami', 'atlanta', 'palm beach', 'west palm beach', 'tampa',
  'orlando', 'sarasota', 'naples', 'fort lauderdale',
]);

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

const KNOWN_COMMUNITIES = new Set([
  'ypo', 'eo', 'entrepreneurs organization', 'vistage',
  'young presidents organization', 'rotary', 'lions club',
  'chamber of commerce', 'bni', 'business network international',
]);

const INDUSTRY_KEYWORDS = {
  'real estate': ['real estate', 'property', 'housing', 'commercial real estate', 'residential', 'realty'],
  'finance': ['finance', 'investment', 'banking', 'financial', 'hedge fund', 'private equity', 'venture capital', 'vc'],
  'technology': ['technology', 'tech', 'software', 'saas', 'ai', 'artificial intelligence', 'machine learning', 'startup'],
  'healthcare': ['healthcare', 'health', 'medical', 'pharma', 'pharmaceutical', 'biotech', 'hospital'],
  'consulting': ['consulting', 'advisory', 'strategy', 'management consulting'],
  'legal': ['legal', 'law', 'attorney', 'lawyer', 'law firm'],
  'marketing': ['marketing', 'advertising', 'media', 'digital marketing', 'branding'],
  'retail': ['retail', 'e-commerce', 'ecommerce', 'consumer goods'],
  'manufacturing': ['manufacturing', 'industrial', 'production'],
  'energy': ['energy', 'oil', 'gas', 'renewable', 'solar', 'utilities'],
  'education': ['education', 'edtech', 'university', 'school', 'academic'],
  'hospitality': ['hospitality', 'hotel', 'restaurant', 'food service'],
};

const STOP_WORDS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
  'today', 'tomorrow', 'yesterday', 'morning', 'afternoon', 'evening', 'night',
  'the', 'this', 'that', 'these', 'those', 'here', 'there',
  'where', 'when', 'what', 'which', 'who', 'how',
  'just', 'only', 'also', 'even', 'still',
]);

// ----- Helpers -----

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

/** Normalize entity name for matching (remove titles, lowercase, trim). */
export function canonicalName(name) {
  return name.replace(/^(?:Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?)\s*/i, '').toLowerCase().trim();
}

function matchAll(pattern, text) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  const results = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push(m);
  }
  return results;
}

// ----- Entity Extraction -----

/**
 * Extract named entities from text using regex patterns.
 * @param {string} text
 * @returns {{ name: string, type: string, canonical_name: string, confidence: number }[]}
 */
export function extractEntities(text) {
  const entities = [];
  const seenCanonical = new Set();

  function add(name, type, confidence) {
    const cn = canonicalName(name);
    if (!cn || cn.length <= 1 || STOP_WORDS.has(cn) || seenCanonical.has(cn)) return;
    seenCanonical.add(cn);
    entities.push({ name, type, canonical_name: cn, confidence });
  }

  for (const pat of PERSON_PATTERNS) {
    for (const m of matchAll(pat, text)) {
      add(m[1] || m[0], 'person', 0.6);
    }
  }

  for (const pat of ORGANIZATION_PATTERNS) {
    for (const m of matchAll(pat, text)) {
      add(m[1] || m[0], 'organization', 0.5);
    }
  }

  for (const pat of PROJECT_PATTERNS) {
    for (const m of matchAll(pat, text)) {
      const name = m[1] || m[0];
      const cn = canonicalName(name);
      if (cn.length > 2) add(name, 'project', 0.5);
    }
  }

  return entities;
}

/**
 * Extract memories/facts from text (commitments, preferences).
 * @param {string} text
 * @param {string[]} [entityNames] - Known entity names for linking
 * @returns {{ content: string, type: string, entities: string[], confidence: number }[]}
 */
export function extractMemories(text, entityNames = []) {
  const memories = [];

  for (const pat of COMMITMENT_PATTERNS) {
    for (const m of matchAll(pat, text)) {
      const content = m[0].trim();
      if (content.length > 10) {
        const related = entityNames.filter(e => content.toLowerCase().includes(e.toLowerCase()));
        memories.push({ content, type: 'commitment', entities: related, confidence: 0.7 });
      }
    }
  }

  for (const pat of PREFERENCE_PATTERNS) {
    for (const m of matchAll(pat, text)) {
      const content = m[0].trim();
      if (content.length > 10) {
        const related = entityNames.filter(e => content.toLowerCase().includes(e.toLowerCase()));
        memories.push({ content, type: 'preference', entities: related, confidence: 0.6 });
      }
    }
  }

  return memories;
}

/**
 * Extract both entities and memories from text.
 * @param {string} text
 * @returns {{ entities: object[], memories: object[] }}
 */
export function extractAll(text) {
  const entities = extractEntities(text);
  const entityNames = entities.map(e => e.name);
  const memories = extractMemories(text, entityNames);
  return { entities, memories };
}

// ----- Attribute Extraction -----

/**
 * Extract structured attributes from text about an entity.
 * @param {string} text
 * @returns {{ geography: object|null, industries: string[]|null, role: string|null, company: string|null, communities: string[]|null }}
 */
export function extractAttributes(text) {
  return {
    geography: _extractGeography(text),
    industries: _extractIndustries(text) || null,
    role: _extractRole(text),
    company: _extractCompany(text),
    communities: _extractCommunities(text) || null,
  };
}

function _extractGeography(text) {
  const textLower = text.toLowerCase();

  for (const city of MAJOR_CITIES) {
    if (textLower.includes(city)) {
      const cityTitle = titleCase(city);
      const escaped = cityTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const stateMatch = text.match(new RegExp(`${escaped},?\\s*([A-Z]{2})\\b`, 'i'));
      if (stateMatch && US_STATES.has(stateMatch[1].toUpperCase())) {
        return { city: cityTitle, state: stateMatch[1].toUpperCase(), country: 'US' };
      }
      return { city: cityTitle, country: 'US' };
    }
  }

  for (const pat of GEOGRAPHY_PATTERNS) {
    const m = matchAll(pat, text)[0];
    if (m) {
      if (m[2]) {
        const state = m[2].trim().toUpperCase();
        if (US_STATES.has(state)) {
          return { city: m[1].trim(), state, country: 'US' };
        }
        return { city: m[1].trim(), state: m[2].trim() };
      }
      return { city: m[1].trim() };
    }
  }

  return null;
}

function _extractIndustries(text) {
  const textLower = text.toLowerCase();
  const industries = [];
  for (const [industry, keywords] of Object.entries(INDUSTRY_KEYWORDS)) {
    for (const kw of keywords) {
      if (textLower.includes(kw)) {
        if (!industries.includes(industry)) industries.push(industry);
        break;
      }
    }
  }
  return industries.length > 0 ? industries : null;
}

function _extractRole(text) {
  for (const pat of ROLE_PATTERNS) {
    const m = matchAll(pat, text)[0];
    if (m) {
      const role = (m[1] || m[0]).trim();
      if (role.length > 1 && !STOP_WORDS.has(role.toLowerCase())) {
        return titleCase(role);
      }
    }
  }
  return null;
}

function _extractCompany(text) {
  const patterns = [
    /(?:works at|employed by|CEO of|founder of|partner at|director at)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/g,
    /\bat\s+([A-Z][A-Za-z]+(?:\s+(?:Inc|Corp|LLC|Ltd|Co|Company|Group|Partners))?\.?)\b/g,
  ];
  for (const pat of patterns) {
    const m = matchAll(pat, text)[0];
    if (m) {
      const company = (m[1] || m[0]).trim();
      if (company.length > 1 && !STOP_WORDS.has(company.toLowerCase())) return company;
    }
  }
  return null;
}

function _extractCommunities(text) {
  const textLower = text.toLowerCase();
  const communities = [];

  for (const c of KNOWN_COMMUNITIES) {
    if (textLower.includes(c)) {
      communities.push(c.length <= 3 ? c.toUpperCase() : titleCase(c));
    }
  }

  for (const pat of COMMUNITY_PATTERNS) {
    for (const m of matchAll(pat, text)) {
      const name = (m[1] || m[0]).trim();
      if (name.length > 2 && !STOP_WORDS.has(name.toLowerCase())) {
        if (!communities.some(c => c.toLowerCase() === name.toLowerCase())) {
          communities.push(titleCase(name));
        }
      }
    }
  }

  return communities.length > 0 ? communities : null;
}
