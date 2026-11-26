// Prints the ANSWERS.md values by running the app's own engines (src/answers/answers.ts).
import { runnerImport } from 'vite';

const { module } = await runnerImport('/src/answers/answers.ts', { configFile: false, logLevel: 'error' });
console.log(module.report());
