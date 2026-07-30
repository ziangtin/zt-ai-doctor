import DefaultTheme from 'vitepress/theme';
import AssetCatalog from '../components/AssetCatalog.vue';
import AssetDetail from '../components/AssetDetail.vue';
import './custom.css';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('AssetCatalog', AssetCatalog);
    app.component('AssetDetail', AssetDetail);
  },
};
