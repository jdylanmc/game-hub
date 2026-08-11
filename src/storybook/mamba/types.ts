export interface MambaVariantEntry {
  centered: boolean;
  id: string;
  renderedHtml: string;
  sourceHtmlPath: string;
  sourceTsPath: string;
  storyName: string;
  upstreamHtmlPath: string;
  upstreamTsPath: string;
}

export interface MambaCategoryData {
  slug: string;
  storyTitle: string;
  title: string;
  variants: MambaVariantEntry[];
}

export interface MambaCategorySummary {
  slug: string;
  storyTitle: string;
  title: string;
  variantCount: number;
}

export interface MambaSourceMetadata {
  commit: string;
  commitDate: string;
  componentCategoryCount: number;
  componentVariantCount: number;
  generatedAt: string;
  repoUrl: string;
  sourceRoot: string;
  version: string;
}
