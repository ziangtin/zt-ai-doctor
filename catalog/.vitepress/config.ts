import { defineConfig } from 'vitepress';

// 本地 dev: base '/'；CI 部署 GitHub Pages 项目站: BASE_PATH=/zt-ai-doctor/
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  lang: 'zh-CN',
  title: 'zai-doctor 药典',
  description: 'agent-agnostic coding-agent 资产 catalog + 使用文档',
  base,
  // 不开 cleanUrls：VitePress 生成 *.html 且内部链接自动补 .html，GH Pages 静态站无 404。
  lastUpdated: false,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }]],
  themeConfig: {
    siteTitle: 'zai-doctor 药典',
    socialLinks: [{ icon: 'github', link: 'https://github.com/ziangtin/zt-ai-doctor' }],
    nav: [
      { text: '药典', link: '/' },
      { text: '使用文档', link: '/guide/usage' },
      {
        text: '指南',
        items: [
          { text: '架构与流程', link: '/guide/architecture' },
          { text: 'agents.json 配置', link: '/guide/agents-config' },
          { text: 'Agent 覆盖矩阵', link: '/guide/coverage-matrix' },
          { text: '药典多版本', link: '/guide/market' },
        ],
      },
      { text: '更新日志', link: '/changelog/v0.2.0' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '使用文档',
          items: [{ text: '快速开始', link: '/guide/usage' }],
        },
        {
          text: '指南',
          items: [
            { text: '架构与流程', link: '/guide/architecture' },
            { text: 'agents.json 配置', link: '/guide/agents-config' },
            { text: 'Agent 覆盖矩阵', link: '/guide/coverage-matrix' },
            { text: '药典多版本', link: '/guide/market' },
          ],
        },
      ],
      '/changelog/': [
        {
          text: '更新日志',
          items: [{ text: 'v0.2.0', link: '/changelog/v0.2.0' }],
        },
      ],
    },
    search: { provider: 'local' },
    outline: { label: '本页导航' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    lastUpdatedText: '最后更新',
    editLink: {
      pattern: 'https://github.com/ziangtin/zt-ai-doctor/edit/main/catalog/:path',
      text: '在 GitHub 上编辑此页',
    },
  },
});
