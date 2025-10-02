export interface FileData {
  id: string;
  name: string;
  file: File;
  size: number;
  type: string;
}

export interface ProcessingLog {
  id: number;
  message: string;
  status: 'success' | 'processing' | 'error';
  timestamp: Date;
}

export interface SimilarArticle {
  number: number;
  title: string;
  content: string;
  similarity: string;
}

export interface ArticleComparison {
  lawName: string;
  similarArticles: SimilarArticle[];
}

export interface LegislationArticle {
  number: number;
  title: string;
  content: string;
  comparisons: ArticleComparison[];
}

export interface PrimaryLegislation {
  name: string;
  articles: LegislationArticle[];
}

export interface AIInsights {
  bestPractices: string;
  suggestedModifications: string;
  legalGaps: string;
}

export interface ComparisonResults {
  primaryLegislation: PrimaryLegislation;
  aiInsights: AIInsights;
}