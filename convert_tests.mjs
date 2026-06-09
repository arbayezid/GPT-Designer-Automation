import fs from 'fs';
import path from 'path';
import babel from '@babel/core';

function getFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...getFiles(fullPath));
    else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) files.push(fullPath);
  }
  return files;
}

const files = getFiles('tests');

for (const file of files) {
  const code = fs.readFileSync(file, 'utf-8');
  
  const result = babel.transformSync(code, {
    filename: file,
    presets: ['@babel/preset-typescript', '@babel/preset-react'],
    retainLines: true,
  });

  if (result && result.code) {
    const newFile = file.replace(/\.ts$/, '.js');
    fs.writeFileSync(newFile, result.code);
    fs.unlinkSync(file);
    console.log(`Converted ${file} to ${newFile}`);
  }
}
