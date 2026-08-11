import '../src/styles.css';

const preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'game-hub-dark',
      values: [
        { name: 'game-hub-dark', value: '#020617' },
        { name: 'studio-slate', value: '#111827' },
        { name: 'soft-light', value: '#f8fafc' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: [
          'Game Hub',
          ['Avatars & Profiles', 'Advertising', 'Community Forums', 'Games', 'Marketing', '*'],
          'Catalog',
          [
            'Mamba Highlights',
            ['Reviews & social proof', 'Navigation & menus', '*'],
            'Mamba',
            ['Overview', 'Review', 'Header', 'Sidebar', 'Tabs', 'Breadcrumb', 'Pagination', '*'],
            '*',
          ],
          '*',
        ],
      },
    },
  },
};

export default preview;
