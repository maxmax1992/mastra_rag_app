import { promises as fs } from 'fs';
import * as path from 'path';
import { MarkItDown } from 'markitdown-ts';
import { logger } from '../config/logger';

export interface PreprocessingResult {
  originalPath: string;
  convertedPath: string;
  wasConverted: boolean;
  fileType: string;
  error?: string;
}

export interface PreprocessingProgress {
  currentFile: number;
  totalFiles: number;
  fileName: string;
  fileType: string;
  status: 'converting' | 'completed' | 'skipped' | 'error';
}

export class DocumentPreprocessor {
  private markitdown: MarkItDown;
  private progressCallback?: (progress: PreprocessingProgress) => void;

  constructor() {
    this.markitdown = new MarkItDown();
  }

  onProgress(callback: (progress: PreprocessingProgress) => void) {
    this.progressCallback = callback;
  }

  private emitProgress(progress: PreprocessingProgress) {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
    logger.info(`[${progress.currentFile}/${progress.totalFiles}] ${progress.status}: ${progress.fileName}`);
  }

  async preprocessCorpusDirectory(corpusPath: string = path.join(process.cwd(), 'corpus')): Promise<PreprocessingResult[]> {
    const results: PreprocessingResult[] = [];

    try {
      const files = await fs.readdir(corpusPath);
      const totalFiles = files.length;
      let currentFile = 0;

      for (const file of files) {
        currentFile++;
        const filePath = path.join(corpusPath, file);
        const stats = await fs.stat(filePath);

        if (!stats.isFile()) {
          this.emitProgress({
            currentFile,
            totalFiles,
            fileName: file,
            fileType: 'directory',
            status: 'skipped'
          });
          continue;
        }

        const result = await this.preprocessFile(filePath, currentFile, totalFiles);
        results.push(result);
      }
    } catch (error) {
      logger.error('Error preprocessing corpus directory:', { error });
      throw error;
    }

    return results;
  }

  async preprocessFile(filePath: string, currentFile: number = 1, totalFiles: number = 1): Promise<PreprocessingResult> {
    const ext = path.extname(filePath).toLowerCase();
    const baseName = path.basename(filePath, ext);
    const dirName = path.dirname(filePath);

    const markdownExts = ['.md', '.txt', '.markdown'];

    if (markdownExts.includes(ext)) {
      this.emitProgress({
        currentFile,
        totalFiles,
        fileName: path.basename(filePath),
        fileType: ext.slice(1),
        status: 'skipped'
      });

      return {
        originalPath: filePath,
        convertedPath: filePath,
        wasConverted: false,
        fileType: ext.slice(1)
      };
    }

    const supportedFormats = ['.pdf', '.docx', '.pptx', '.xlsx', '.html', '.xml', '.csv'];

    if (!supportedFormats.includes(ext)) {
      this.emitProgress({
        currentFile,
        totalFiles,
        fileName: path.basename(filePath),
        fileType: ext.slice(1),
        status: 'skipped'
      });

      return {
        originalPath: filePath,
        convertedPath: filePath,
        wasConverted: false,
        fileType: ext.slice(1),
        error: `Unsupported file format: ${ext}`
      };
    }

    try {
      this.emitProgress({
        currentFile,
        totalFiles,
        fileName: path.basename(filePath),
        fileType: ext.slice(1),
        status: 'converting'
      });

      // Use file path directly instead of buffer
      const result = await this.markitdown.convert(filePath);

      if (!result || !result.text_content) {
        throw new Error('Failed to convert file - no content returned');
      }

      const convertedPath = path.join(dirName, `${baseName}.md`);
      await fs.writeFile(convertedPath, result.text_content);

      this.emitProgress({
        currentFile,
        totalFiles,
        fileName: path.basename(filePath),
        fileType: ext.slice(1),
        status: 'completed'
      });

      logger.info(`✅ Converted ${path.basename(filePath)} to ${path.basename(convertedPath)}`);

      return {
        originalPath: filePath,
        convertedPath,
        wasConverted: true,
        fileType: ext.slice(1)
      };
    } catch (error) {
      this.emitProgress({
        currentFile,
        totalFiles,
        fileName: path.basename(filePath),
        fileType: ext.slice(1),
        status: 'error'
      });

      logger.error(`Failed to convert ${filePath}:`, { error });

      return {
        originalPath: filePath,
        convertedPath: filePath,
        wasConverted: false,
        fileType: ext.slice(1),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getCorpusFiles(corpusPath: string = path.join(process.cwd(), 'corpus')): Promise<string[]> {
    try {
      const files = await fs.readdir(corpusPath);
      return files
        .filter(file => {
          const ext = path.extname(file).toLowerCase();
          return ['.md', '.txt', '.markdown'].includes(ext);
        })
        .map(file => path.join(corpusPath, file));
    } catch (error) {
      logger.error('Error reading corpus directory:', { error });
      return [];
    }
  }
}