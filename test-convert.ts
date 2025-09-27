import { DocumentPreprocessor } from './src/mastra/services/DocumentPreprocessor';

async function test() {
  const preprocessor = new DocumentPreprocessor();

  preprocessor.onProgress((progress) => {
    console.log(`[${progress.status}] ${progress.fileName}.${progress.fileType}`);
  });

  try {
    const result = await preprocessor.preprocessFile('./corpus/dqn_paper.pdf');
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

test();