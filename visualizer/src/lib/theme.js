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
    label: 'Matrix Rain',
    css: {
      '--bg': '#010503',
      '--bg-elevated': '#04100a',
      '--panel': 'rgba(3, 12, 8, 0.92)',
      '--panel-strong': 'rgba(2, 8, 5, 0.97)',
      '--panel-muted': 'rgba(7, 22, 15, 0.84)',
      '--border': 'rgba(62, 171, 102, 0.26)',
      '--border-strong': 'rgba(108, 255, 156, 0.54)',
      '--line': 'rgba(53, 120, 77, 0.18)',
      '--text': '#dff9e8',
      '--text-dim': '#93d8a9',
      '--text-muted': '#4f8862',
      '--accent': '#5bff92',
      '--accent-secondary': '#d8ff67',
      '--accent-soft': 'rgba(91, 255, 146, 0.16)',
      '--success': '#5bff92',
      '--danger': '#ff7b55',
      '--glow-a': 'rgba(91, 255, 146, 0.18)',
      '--glow-b': 'rgba(216, 255, 103, 0.09)'
    },
    colors: {
      entity: '#64ff98',
      memory: '#79a489',
      commitment: '#ff7b55',
      pattern: '#aaffb1',
      trace: '#e5ffb8',
      selected: '#f7fff8'
    },
    subtypes: {
      person: '#d8ff67',
      organization: '#58f0d8',
      project: '#64ff98',
      concept: '#9bff67',
      location: '#baffca',
      fact: '#79a489',
      commitment: '#ff7b55',
      learning: '#64ff98',
      observation: '#58f0d8',
      preference: '#d8ff67',
      pattern: '#aaffb1',
      relationship: '#5bff92',
      behavioral: '#94ff7d',
      communication: '#58f0d8',
      scheduling: '#d8ff67'
    },
    scene: {
      clear: '#010503',
      fog: '#010604',
      ambient: '#74a787',
      key: '#5bff92',
      rim: '#d8ff67',
      grid: '#1b4b2d',
      stars: ['#5bff92', '#aaffb1', '#d8ff67', '#f2fff5'],
      bloom: 0.4,
      chromatic: 0.00018
    }
  },
  tron: {
    id: 'tron',
    label: 'TRON Arena',
    css: {
      '--bg': '#010613',
      '--bg-elevated': '#051021',
      '--panel': 'rgba(4, 14, 30, 0.92)',
      '--panel-strong': 'rgba(2, 9, 22, 0.97)',
      '--panel-muted': 'rgba(8, 22, 44, 0.86)',
      '--border': 'rgba(84, 178, 255, 0.28)',
      '--border-strong': 'rgba(87, 245, 255, 0.58)',
      '--line': 'rgba(67, 138, 212, 0.19)',
      '--text': '#e5f4ff',
      '--text-dim': '#9ac7ec',
      '--text-muted': '#5d86b4',
      '--accent': '#58efff',
      '--accent-secondary': '#ff9548',
      '--accent-soft': 'rgba(88, 239, 255, 0.16)',
      '--success': '#8effda',
      '--danger': '#ff8e5f',
      '--glow-a': 'rgba(88, 239, 255, 0.18)',
      '--glow-b': 'rgba(255, 149, 72, 0.1)'
    },
    colors: {
      entity: '#63ebff',
      memory: '#7e9fd8',
      commitment: '#ff9555',
      pattern: '#5d89ff',
      trace: '#f6fdff',
      selected: '#ffffff'
    },
    subtypes: {
      person: '#ffcb62',
      organization: '#71a7ff',
      project: '#63ebff',
      concept: '#9b8bff',
      location: '#9be7ff',
      fact: '#7e9fd8',
      commitment: '#ff9555',
      learning: '#8effda',
      observation: '#71d8ff',
      preference: '#ffcb62',
      pattern: '#5d89ff',
      relationship: '#58efff',
      behavioral: '#8effda',
      communication: '#71d8ff',
      scheduling: '#ffcb62'
    },
    scene: {
      clear: '#020613',
      fog: '#03101d',
      ambient: '#88abcf',
      key: '#58efff',
      rim: '#ff9548',
      grid: '#165b8f',
      stars: ['#58efff', '#71a7ff', '#ff9548', '#f6fdff'],
      bloom: 0.74,
      chromatic: 0.0011
    }
  },
  offworld: {
    id: 'offworld',
    label: 'Neo Tokyo',
    css: {
      '--bg': '#08040f',
      '--bg-elevated': '#14091c',
      '--panel': 'rgba(18, 9, 26, 0.92)',
      '--panel-strong': 'rgba(11, 6, 18, 0.97)',
      '--panel-muted': 'rgba(31, 15, 42, 0.86)',
      '--border': 'rgba(234, 86, 182, 0.28)',
      '--border-strong': 'rgba(255, 110, 206, 0.56)',
      '--line': 'rgba(129, 71, 124, 0.2)',
      '--text': '#fde9ff',
      '--text-dim': '#d4acd7',
      '--text-muted': '#916b98',
      '--accent': '#ff6fcd',
      '--accent-secondary': '#5de1ff',
      '--accent-soft': 'rgba(255, 111, 205, 0.16)',
      '--success': '#7effcf',
      '--danger': '#ff744f',
      '--glow-a': 'rgba(255, 111, 205, 0.18)',
      '--glow-b': 'rgba(93, 225, 255, 0.1)'
    },
    colors: {
      entity: '#ff7bd5',
      memory: '#b589c6',
      commitment: '#ff744f',
      pattern: '#5de1ff',
      trace: '#ffe87a',
      selected: '#fff7ff'
    },
    subtypes: {
      person: '#ffe26c',
      organization: '#6dc3ff',
      project: '#7effcf',
      concept: '#bb84ff',
      location: '#ff9f7a',
      fact: '#b589c6',
      commitment: '#ff744f',
      learning: '#7effcf',
      observation: '#6dc3ff',
      preference: '#ffe26c',
      pattern: '#5de1ff',
      relationship: '#ff7bd5',
      behavioral: '#ff744f',
      communication: '#6dc3ff',
      scheduling: '#ffe26c'
    },
    scene: {
      clear: '#09050e',
      fog: '#120716',
      ambient: '#c296be',
      key: '#ff6fcd',
      rim: '#5de1ff',
      grid: '#5d2766',
      stars: ['#ff6fcd', '#5de1ff', '#ffe26c', '#fff3ff'],
      bloom: 0.72,
      chromatic: 0.001
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
