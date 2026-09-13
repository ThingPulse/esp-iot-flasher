// Rename index.js to index.mjs

import fs from 'fs';
import crypto from 'crypto';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Function to generate MD5 hash
const generateMD5 = (filePath) => {
    const data = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(data).digest('hex');
};

// Load JSON data
const loadJsonData = (filePath) => {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const saveJsonData = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// Update MD5 hashes in JSON structure
const updateMd5Hashes = (data) => {
    data.forEach(item => {
        item.partitions.forEach(partition => {
            const filePath = partition.url;
            if (fs.existsSync(filePath)) {
                const md5Hash = generateMD5(filePath);
                partition.md5 = md5Hash;
            } else {
                console.error(`File not found: ${filePath}`);
            }
        });
    });
    return data;
};

// Validate MD5 hashes in JSON structure
const validateMd5Hashes = (data) => {
    let isValid = true;
    data.forEach(item => {
        item.partitions.forEach(partition => {
            const filePath = partition.url;
            if (fs.existsSync(filePath)) {
                const actualMd5Hash = generateMD5(filePath);
                if (partition.md5 !== actualMd5Hash) {
                    console.error(`MD5 mismatch for ${filePath}: expected ${partition.md5}, got ${actualMd5Hash}`);
                    isValid = false;
                }
            } else {
                console.error(`File not found: ${filePath}`);
                isValid = false;
            }
        });
    });
    return isValid;
};

// Main function to run the routines
const main = () => {
    const dataFilePath = './assets/defaultDeviceConfiguration.json';
    const data = loadJsonData(dataFilePath);

    // Update MD5 hashes
    const updatedData = updateMd5Hashes(data);
    saveJsonData(dataFilePath, updatedData);
    console.log('MD5 hashes updated successfully.');

    // Validate MD5 hashes
    const isValid = validateMd5Hashes(updatedData);
    if (isValid) {
        console.log('All MD5 hashes are valid.');
    } else {
        console.error('Some MD5 hashes are invalid.');
    }
};

if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}

// Export functions for testing
export {
    generateMD5,
    loadJsonData,
    saveJsonData,
    updateMd5Hashes,
    validateMd5Hashes
};
