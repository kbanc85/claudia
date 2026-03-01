export const ENTITY_SUBTYPES = ['person', 'organization', 'project', 'concept', 'location'];
export const MEMORY_SUBTYPES = ['fact', 'commitment', 'learning', 'observation', 'preference', 'pattern'];
export const PATTERN_SUBTYPES = ['relationship', 'behavioral', 'communication', 'scheduling'];

export const APP_THEMES = {
  claudia: {
    id: 'claudia',
    label: 'Claudia Core',
    css: {
      '--bg': '#05090d',
      '--bg-elevated': '#0b1117',
      '--panel': 'rgba(10, 16, 22, 0.9)',
      '--panel-strong': 'rgba(7, 11, 16, 0.96)',
      '--panel-muted': 'rgba(18, 28, 38, 0.82)',
      '--border': 'rgba(104, 146, 178, 0.24)',
      '--border-strong': 'rgba(137, 210, 255, 0.42)',
      '--line': 'rgba(94, 127, 153, 0.17)',
      '--text': '#d7e7f2',
      '--text-dim': '#9ab3c7',
      '--text-muted': '#678095',
      '--accent': '#79dbff',
      '--accent-secondary': '#f7c16b',
      '--accent-soft': 'rgba(121, 219, 255, 0.12)',
      '--success': '#6ef0bf',
      '--danger': '#ff8e77',
      '--glow-a': 'rgba(74, 165, 255, 0.14)',
      '--glow-b': 'rgba(247, 193, 107, 0.07)'
    },
    colors: {
      entity: '#7fd8ff',
      memory: '#8aa3b8',
      commitment: '#ff956f',
      pattern: '#ae98ff',
      trace: '#f7c16b',
      selected: '#f5fbff'
    },
    subtypes: {
      person: '#f0cf72',
      organization: '#7fb9ff',
      project: '#77efbf',
      concept: '#d59fff',
      location: '#f7c16b',
      fact: '#8aa3b8',
      commitment: '#ff956f',
      learning: '#6ef0bf',
      observation: '#7fd8ff',
      preference: '#f7d589',
      pattern: '#c094ff',
      relationship: '#99afff',
      behavioral: '#67e6bd',
      communication: '#7fd8ff',
      scheduling: '#f7c16b'
    },
    scene: {
      clear: '#04080c',
      fog: '#04080c',
      ambient: '#9ab5cb',
      key: '#82dfff',
      rim: '#f7c16b',
      grid: '#173040',
      stars: ['#6fd8ff', '#8fb0ff', '#f7c16b', '#dcd9ff'],
      bloom: 0.58,
      chromatic: 0.0006
    }
  },
  infrared: {
    id: 'infrared',
    label: 'Infrared Ops',
    css: {
      '--bg': '#0b0908',
      '--bg-elevated': '#150f0d',
      '--panel': 'rgba(23, 15, 13, 0.9)',
      '--panel-strong': 'rgba(16, 10, 9, 0.96)',
      '--panel-muted': 'rgba(35, 24, 22, 0.84)',
      '--border': 'rgba(193, 124, 93, 0.24)',
      '--border-strong': 'rgba(255, 171, 117, 0.42)',
      '--line': 'rgba(152, 102, 76, 0.17)',
      '--text': '#f0ddd3',
      '--text-dim': '#c3a394',
      '--text-muted': '#8d6d62',
      '--accent': '#ffae76',
      '--accent-secondary': '#ff6f66',
      '--accent-soft': 'rgba(255, 174, 118, 0.12)',
      '--success': '#8cebc0',
      '--danger': '#ff7f6d',
      '--glow-a': 'rgba(255, 111, 102, 0.11)',
      '--glow-b': 'rgba(255, 174, 118, 0.08)'
    },
    colors: {
      entity: '#ffb37d',
      memory: '#c89f8a',
      commitment: '#ff6f66',
      pattern: '#ffd26f',
      trace: '#ffdca2',
      selected: '#fff6f2'
    },
    subtypes: {
      person: '#ffd27b',
      organization: '#8bb8ff',
      project: '#81efb9',
      concept: '#ff9c86',
      location: '#ffd8ad',
      fact: '#c89f8a',
      commitment: '#ff6f66',
      learning: '#8cebc0',
      observation: '#ffba8e',
      preference: '#ffe08c',
      pattern: '#ffd26f',
      relationship: '#ffae76',
      behavioral: '#ff9279',
      communication: '#ffba8e',
      scheduling: '#ffe08c'
    },
    scene: {
      clear: '#0a0807',
      fog: '#0a0807',
      ambient: '#c09383',
      key: '#ffb37d',
      rim: '#ff6f66',
      grid: '#3a221c',
      stars: ['#ff6f66', '#ffb37d', '#ffd26f', '#ffead4'],
      bloom: 0.54,
      chromatic: 0.0005
    }
  },
  polar: {
    id: 'polar',
    label: 'Polar Signal',
    css: {
      '--bg': '#041015',
      '--bg-elevated': '#071821',
      '--panel': 'rgba(7, 20, 27, 0.9)',
      '--panel-strong': 'rgba(5, 15, 20, 0.96)',
      '--panel-muted': 'rgba(14, 32, 40, 0.83)',
      '--border': 'rgba(97, 166, 182, 0.25)',
      '--border-strong': 'rgba(145, 232, 244, 0.42)',
      '--line': 'rgba(75, 126, 139, 0.17)',
      '--text': '#d7eef4',
      '--text-dim': '#9abdc5',
      '--text-muted': '#678f98',
      '--accent': '#7ef1ff',
      '--accent-secondary': '#8acbff',
      '--accent-soft': 'rgba(126, 241, 255, 0.12)',
      '--success': '#8dffd1',
      '--danger': '#ffa088',
      '--glow-a': 'rgba(126, 241, 255, 0.12)',
      '--glow-b': 'rgba(138, 203, 255, 0.08)'
    },
    colors: {
      entity: '#8aeaff',
      memory: '#8db8c0',
      commitment: '#ffa088',
      pattern: '#8acbff',
      trace: '#d5fbff',
      selected: '#f3fdff'
    },
    subtypes: {
      person: '#f5dc87',
      organization: '#8acbff',
      project: '#8dffd1',
      concept: '#a3b9ff',
      location: '#d8fff5',
      fact: '#8db8c0',
      commitment: '#ffa088',
      learning: '#8dffd1',
      observation: '#8aeaff',
      preference: '#d8ffc5',
      pattern: '#8acbff',
      relationship: '#8acbff',
      behavioral: '#8dffd1',
      communication: '#8aeaff',
      scheduling: '#d8ffc5'
    },
    scene: {
      clear: '#041015',
      fog: '#041015',
      ambient: '#8fbfca',
      key: '#8aeaff',
      rim: '#8acbff',
      grid: '#16333c',
      stars: ['#8aeaff', '#8acbff', '#8dffd1', '#f0ffff'],
      bloom: 0.5,
      chromatic: 0.0004
    }
  },
  matrix: {
    id: 'matrix',
    label: 'Matrix Construct',
    css: {
      '--bg': '#030906',
      '--bg-elevated': '#07110b',
      '--panel': 'rgba(6, 18, 12, 0.9)',
      '--panel-strong': 'rgba(4, 12, 8, 0.96)',
      '--panel-muted': 'rgba(12, 28, 18, 0.82)',
      '--border': 'rgba(84, 166, 112, 0.24)',
      '--border-strong': 'rgba(123, 255, 173, 0.42)',
      '--line': 'rgba(62, 110, 74, 0.16)',
      '--text': '#d9f5e1',
      '--text-dim': '#9ed0ae',
      '--text-muted': '#5f8d6d',
      '--accent': '#76ffab',
      '--accent-secondary': '#b5ffd0',
      '--accent-soft': 'rgba(118, 255, 171, 0.12)',
      '--success': '#76ffab',
      '--danger': '#ff8f7a',
      '--glow-a': 'rgba(84, 255, 153, 0.14)',
      '--glow-b': 'rgba(181, 255, 208, 0.07)'
    },
    colors: {
      entity: '#7cffaf',
      memory: '#7ea892',
      commitment: '#ff8f7a',
      pattern: '#afffc4',
      trace: '#dfffe9',
      selected: '#f5fff9'
    },
    subtypes: {
      person: '#d7ff78',
      organization: '#71f0c2',
      project: '#7cffaf',
      concept: '#a8ff8f',
      location: '#b5ffd0',
      fact: '#7ea892',
      commitment: '#ff8f7a',
      learning: '#7cffaf',
      observation: '#71f0c2',
      preference: '#d7ff78',
      pattern: '#afffc4',
      relationship: '#76ffab',
      behavioral: '#98ffb1',
      communication: '#71f0c2',
      scheduling: '#d7ff78'
    },
    scene: {
      clear: '#020704',
      fog: '#020704',
      ambient: '#88b698',
      key: '#76ffab',
      rim: '#b5ffd0',
      grid: '#143221',
      stars: ['#76ffab', '#afffc4', '#d7ff78', '#f2fff6'],
      bloom: 0.46,
      chromatic: 0.00025
    }
  },
  tron: {
    id: 'tron',
    label: 'Lightcycle Grid',
    css: {
      '--bg': '#040812',
      '--bg-elevated': '#071122',
      '--panel': 'rgba(7, 17, 34, 0.9)',
      '--panel-strong': 'rgba(4, 10, 22, 0.96)',
      '--panel-muted': 'rgba(10, 26, 48, 0.83)',
      '--border': 'rgba(96, 164, 255, 0.24)',
      '--border-strong': 'rgba(102, 240, 255, 0.44)',
      '--line': 'rgba(76, 126, 195, 0.16)',
      '--text': '#dfeeff',
      '--text-dim': '#9eb9db',
      '--text-muted': '#6581a5',
      '--accent': '#66f0ff',
      '--accent-secondary': '#ff9f6f',
      '--accent-soft': 'rgba(102, 240, 255, 0.12)',
      '--success': '#8ff6cf',
      '--danger': '#ff8f7a',
      '--glow-a': 'rgba(102, 240, 255, 0.15)',
      '--glow-b': 'rgba(255, 159, 111, 0.08)'
    },
    colors: {
      entity: '#71d6ff',
      memory: '#7a98b8',
      commitment: '#ff9f6f',
      pattern: '#7cb3ff',
      trace: '#f5fbff',
      selected: '#ffffff'
    },
    subtypes: {
      person: '#ffd36f',
      organization: '#71a9ff',
      project: '#66f0ff',
      concept: '#b18cff',
      location: '#9de3ff',
      fact: '#7a98b8',
      commitment: '#ff9f6f',
      learning: '#8ff6cf',
      observation: '#71d6ff',
      preference: '#ffd36f',
      pattern: '#7cb3ff',
      relationship: '#66f0ff',
      behavioral: '#8ff6cf',
      communication: '#71d6ff',
      scheduling: '#ffd36f'
    },
    scene: {
      clear: '#030713',
      fog: '#030713',
      ambient: '#86a4cf',
      key: '#66f0ff',
      rim: '#ff9f6f',
      grid: '#123257',
      stars: ['#66f0ff', '#71a9ff', '#ff9f6f', '#f5fbff'],
      bloom: 0.62,
      chromatic: 0.00075
    }
  },
  offworld: {
    id: 'offworld',
    label: 'Offworld Noir',
    css: {
      '--bg': '#08070d',
      '--bg-elevated': '#110d17',
      '--panel': 'rgba(18, 13, 23, 0.9)',
      '--panel-strong': 'rgba(12, 9, 17, 0.96)',
      '--panel-muted': 'rgba(28, 22, 36, 0.84)',
      '--border': 'rgba(207, 117, 88, 0.24)',
      '--border-strong': 'rgba(255, 160, 120, 0.42)',
      '--line': 'rgba(110, 82, 96, 0.16)',
      '--text': '#f2ddd5',
      '--text-dim': '#c7aaa1',
      '--text-muted': '#8f736c',
      '--accent': '#ff9b73',
      '--accent-secondary': '#ffd26b',
      '--accent-soft': 'rgba(255, 155, 115, 0.12)',
      '--success': '#8be2c0',
      '--danger': '#ff7d73',
      '--glow-a': 'rgba(255, 155, 115, 0.13)',
      '--glow-b': 'rgba(255, 210, 107, 0.08)'
    },
    colors: {
      entity: '#ffab84',
      memory: '#b29390',
      commitment: '#ff7d73',
      pattern: '#ffd26b',
      trace: '#fff0de',
      selected: '#fff9f3'
    },
    subtypes: {
      person: '#ffd26b',
      organization: '#75b7ff',
      project: '#8be2c0',
      concept: '#d7a2ff',
      location: '#ffab84',
      fact: '#b29390',
      commitment: '#ff7d73',
      learning: '#8be2c0',
      observation: '#75b7ff',
      preference: '#ffe08c',
      pattern: '#ffd26b',
      relationship: '#ffab84',
      behavioral: '#ff7d73',
      communication: '#75b7ff',
      scheduling: '#ffe08c'
    },
    scene: {
      clear: '#07060b',
      fog: '#07060b',
      ambient: '#c39b8f',
      key: '#ff9b73',
      rim: '#ffd26b',
      grid: '#3a242b',
      stars: ['#ff9b73', '#ffd26b', '#75b7ff', '#fff0de'],
      bloom: 0.56,
      chromatic: 0.00055
    }
  }
};

export const DEFAULT_THEME_ID = 'claudia';

export function getTheme(themeId = DEFAULT_THEME_ID) {
  return APP_THEMES[themeId] || APP_THEMES[DEFAULT_THEME_ID];
}

export function alpha(hex, opacity) {
  if (!hex) return `rgba(255, 255, 255, ${opacity})`;
  const value = hex.replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((char) => `${char}${char}`).join('')
    : value;
  const int = Number.parseInt(normalized, 16);
  const red = (int >> 16) & 255;
  const green = (int >> 8) & 255;
  const blue = int & 255;
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

export function applyThemeToDocument(themeId = DEFAULT_THEME_ID) {
  if (typeof document === 'undefined') return;
  const theme = getTheme(themeId);
  document.documentElement.dataset.theme = theme.id;
  for (const [key, value] of Object.entries(theme.css)) {
    document.documentElement.style.setProperty(key, value);
  }
}

export function nodeTone(node, themeId = DEFAULT_THEME_ID) {
  const theme = getTheme(themeId);
  if (node.status === 'trace') return theme.colors.trace;
  return theme.subtypes[node.subtype] || theme.colors[node.kind] || '#8fa4bf';
}

export function resultTone(result, themeId = DEFAULT_THEME_ID, renderSettings = {}) {
  const theme = getTheme(themeId);
  if (result.kind === 'entity') {
    if (result.subtype === 'person') return renderSettings.personColor || theme.subtypes.person;
    if (result.subtype === 'organization') return renderSettings.organizationColor || theme.subtypes.organization;
    if (result.subtype === 'project') return renderSettings.projectColor || theme.subtypes.project;
  }
  if (result.kind === 'commitment') {
    return renderSettings.commitmentColor || theme.colors.commitment;
  }
  if (result.kind === 'memory') {
    return renderSettings.memoryColor || theme.colors.memory;
  }
  return theme.subtypes[result.subtype] || theme.colors[result.kind] || theme.colors.entity;
}

export function nodeAccent(node, themeId = DEFAULT_THEME_ID) {
  const theme = getTheme(themeId);
  if (node.kind === 'commitment') return theme.colors.commitment;
  if (node.kind === 'pattern') return theme.colors.pattern;
  if (node.status === 'trace') return theme.colors.trace;
  return theme.colors.entity;
}

export function edgeTone(edge, themeId = DEFAULT_THEME_ID) {
  const theme = getTheme(themeId);
  if (edge.channel === 'trace' || edge.status === 'trace') return theme.colors.trace;
  if (edge.channel === 'commitment') return theme.colors.commitment;
  if (edge.channel === 'relationship') return alpha(theme.colors.entity, 0.55);
  return alpha(theme.colors.memory, 0.36);
}

export function kindLabel(kind) {
  switch (kind) {
    case 'entity':
      return 'Entity';
    case 'memory':
      return 'Memory';
    case 'commitment':
      return 'Commitment';
    case 'pattern':
      return 'Pattern';
    default:
      return kind;
  }
}

export function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function scorePercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

export function formatDateTime(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(parsed);
}

export function formatDateShort(value) {
  if (!value) return 'Unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric'
  }).format(parsed);
}

export function formatRelative(value) {
  if (!value) return 'No recent activity';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'No recent activity';
  const delta = parsed.getTime() - Date.now();
  const abs = Math.abs(delta);
  const minute = 60000;
  const hour = minute * 60;
  const day = hour * 24;
  if (abs < hour) return `${Math.round(delta / minute)}m`;
  if (abs < day) return `${Math.round(delta / hour)}h`;
  return `${Math.round(delta / day)}d`;
}

export function trunc(value, max = 120) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max).trimEnd()}...` : text;
}
