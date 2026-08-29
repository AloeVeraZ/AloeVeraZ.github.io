import { cp, mkdir, rm } from 'node:fs/promises';

const staticFiles = ['index.html', 'styles.css', 'app.js', 'data.json'];
const staticDirectories = ['assets', 'js', 'pages'];

await rm('dist', { recursive: true, force: true });
await mkdir('dist/client', { recursive: true });
await mkdir('dist/server', { recursive: true });

await Promise.all(staticFiles.map(file => cp(file, `dist/client/${file}`)));
await Promise.all(staticDirectories.map(directory => cp(directory, `dist/client/${directory}`, { recursive: true })));
await cp('worker/index.js', 'dist/server/index.js');
