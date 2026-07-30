import data from '../src/data/catalog.json';

export default {
  paths() {
    return data.assets.map((a) => ({
      params: { id: a.id },
      content: `---\ntitle: ${a.title || a.id} · 药典\ndescription: ${a.description || ''}\neditLink: false\n---`,
    }));
  },
};
