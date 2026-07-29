export const languages = ['zh', 'en'] as const;

export type Language = (typeof languages)[number];

export const site = {
  name: {
    zh: '爪哇鱼',
    en: 'JavaYu',
  },
  url: 'https://yuhp.dev',
  author: 'JavaYu',
  description: {
    zh: '记录技术、思考与持续学习。',
    en: 'Notes on technology, ideas, and continuous learning.',
  },
} as const;

export const copy = {
  zh: {
    home: '首页',
    archive: '文章',
    about: '关于',
    courses: '公开课',
    projects: '项目',
    opencodeModelsDiscovery: 'OpenCode 模型发现',
    latest: '最近写作',
    intro: '记录技术、思考与持续学习。',
    noPosts: '文章即将发布。',
    readArticle: '阅读文章',
    readingTime: '分钟阅读',
    comments: '讨论',
    languageName: '中文',
    switchLanguage: 'English',
    aboutTitle: '关于我',
    aboutText: '这里是爪哇鱼的个人博客，记录在技术实践中发现的问题、想法与答案。',
    writtenIn: '写于',
    updatedIn: '更新于',
    backToWriting: '返回文章',
    translations: '语言',
    footer: '保持好奇，持续记录。',
  },
  en: {
    home: 'Home',
    archive: 'Writing',
    about: 'About',
    courses: 'Courses',
    projects: 'Projects',
    opencodeModelsDiscovery: 'OpenCode Models Discovery',
    latest: 'Recent writing',
    intro: 'Notes on technology, ideas, and continuous learning.',
    noPosts: 'Writing is on its way.',
    readArticle: 'Read article',
    readingTime: 'min read',
    comments: 'Discussion',
    languageName: 'English',
    switchLanguage: '中文',
    aboutTitle: 'About',
    aboutText: 'JavaYu is a personal blog for questions, experiments, and answers found while building with technology.',
    writtenIn: 'Written',
    updatedIn: 'Updated',
    backToWriting: 'Back to writing',
    translations: 'Languages',
    footer: 'Stay curious. Keep notes.',
  },
} as const;

export function isLanguage(value: string | undefined): value is Language {
  return Boolean(value && languages.includes(value as Language));
}

export function dateForLocale(date: Date, lang: Language) {
  return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function alternateLanguage(lang: Language): Language {
  return lang === 'zh' ? 'en' : 'zh';
}

export function pathForLanguage(pathname: string, lang: Language) {
  const pathWithoutLanguage = pathname.replace(/^\/(zh|en)(?=\/|$)/, '') || '/';
  return `/${lang}${pathWithoutLanguage === '/' ? '/' : pathWithoutLanguage}`;
}
