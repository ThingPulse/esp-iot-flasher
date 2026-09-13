import { expect } from 'chai';
import { loadJsonData, validateMd5Hashes, updateMd5Hashes } from '../index.mjs'; // Adjust the path as needed

describe('MD5 Hash Validation', () => {
    const dataFilePath = './assets/defaultDeviceConfiguration.json';

    it('should validate MD5 hashes correctly', () => {
        const data = loadJsonData(dataFilePath);
        const updatedData = updateMd5Hashes(data);
        const isValid = validateMd5Hashes(updatedData);
        expect(isValid).to.be.true;
    });
});
