const fs = require('fs');
const path = require('path');

const files = ['index.html', 'app.js', 'style.css'];
const distDir = path.join(__dirname, 'dist');

console.log('Building frontend...');

if (!fs.existsSync(distDir)) {
    console.log('Creating dist directory...');
    fs.mkdirSync(distDir);
}

files.forEach(file => {
    const srcPath = path.join(__dirname, file);
    const destPath = path.join(distDir, file);
    
    if (fs.existsSync(srcPath)) {
        console.log(`Copying ${file} to dist/`);
        fs.copyFileSync(srcPath, destPath);
    } else {
        console.warn(`Warning: ${file} not found in root!`);
    }
});

console.log('Frontend build complete.');
