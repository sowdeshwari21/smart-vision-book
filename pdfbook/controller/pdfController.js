import Tesseract from 'tesseract.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import PDF from '../models/pdfModel.js';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import fs from 'fs';
import translate from 'google-translate-api-x';
import pdfjsLib from 'pdfjs-dist';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API,
    api_secret: process.env.CLOUDINARY_SECRET
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

export const upload = multer({ storage: storage });

export const uploadPDF = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const filePath = path.resolve(req.file.path);

        // Upload to Cloudinary with proper resource type for PDF
        const result = await cloudinary.uploader.upload(filePath, {
            resource_type: "auto", // This will automatically detect PDF
            folder: "pdfs",
            format: "pdf" // Ensure PDF format is preserved
        });
        
        // Save PDF metadata to MongoDB with Cloudinary URL
        const pdfDoc = await PDF.create({
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            path: result.secure_url,
            cloudinaryId: result.public_id,
            extractedText: "" // Initially empty, will be filled by extract endpoint
        });

        // Clean up the temporary file
        fs.unlinkSync(filePath);

        res.status(200).json({ 
            message: 'PDF uploaded successfully',
            pdfId: pdfDoc._id,
            pdf: pdfDoc,
            viewUrl: result.secure_url // This URL can be used to view the PDF
        });

    } catch (error) {
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};

export const extractTextFromPDF = async (req, res) => {
    try {
        const { pdfId } = req.params;
        
        // Find the PDF document
        const pdfDoc = await PDF.findById(pdfId);
        if (!pdfDoc) {
            return res.status(404).json({ error: 'PDF not found' });
        }
        
        // Get the file path from Cloudinary URL
        const filePath = pdfDoc.path;
        
        // Extract text using Tesseract
        const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
        
        // Update the PDF document with extracted text
        pdfDoc.extractedText = text;
        await pdfDoc.save();
        
        res.status(200).json({ 
            message: 'Text extracted successfully',
            pdfId: pdfDoc._id,
            extractedText: text
        });

    } catch (error) {
        res.status(500).json({ error: 'Error extracting text', details: error.message });
    }
};

export const getAllPDFs = async (req, res) => {
    try {
        const pdfs = await PDF.find({});
        res.status(200).json(pdfs);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching PDFs', details: error.message });
    }
};

export const deletePDF = async (req, res) => {
    try {
        const { pdfId } = req.params;
        const pdfDoc = await PDF.findById(pdfId);
        if (!pdfDoc) {
            return res.status(404).json({ error: 'PDF not found' });
        }

        await cloudinary.uploader.destroy(pdfDoc.cloudinaryId);
        await PDF.findByIdAndDelete(pdfId);

        res.status(200).json({ message: 'PDF deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting PDF', details: error.message });
    }
};

export const getPDFByName = async (req, res) => {
    try {
        const { name } = req.params;
        const pdfs = await PDF.find({ 
            originalName: { $regex: name, $options: 'i' } 
        });
        
        if (!pdfs.length) {
            return res.status(404).json({ message: 'No PDFs found with that name' });
        }
        
        res.status(200).json(pdfs);
    } catch (error) {
        res.status(500).json({ error: 'Error searching PDFs', details: error.message });
    }
};

export const updatePDF = async (req, res) => {
    try {
        const { pdfId } = req.params;
        const updates = req.body;
        
        const pdfDoc = await PDF.findByIdAndUpdate(
            pdfId,
            updates,
            { new: true, runValidators: true }
        );
        
        if (!pdfDoc) {
            return res.status(404).json({ error: 'PDF not found' });
        }
        
        res.status(200).json({ 
            message: 'PDF updated successfully',
            pdf: pdfDoc
        });
    } catch (error) {
        res.status(500).json({ error: 'Error updating PDF', details: error.message });
    }
};

export const translatePDF = async (req, res) => {
    try {
        const { pdfId } = req.params;
        const { targetLang, text } = req.body;
        
        // Find the PDF document
        const pdfDoc = await PDF.findById(pdfId);
        if (!pdfDoc) {
            return res.status(404).json({ error: 'PDF not found' });
        }

        // If text is provided, translate that specific text
        // Otherwise, translate the entire PDF text
        const textToTranslate = text || pdfDoc.extractedText;

        // If no text to translate exists, extract it first
        if (!textToTranslate) {
            try {
                // Load the PDF document
                const loadingTask = pdfjsLib.getDocument(pdfDoc.path);
                const pdf = await loadingTask.promise;
                
                let fullText = '';
                // Extract text from each page
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    
                    // Combine text items
                    const pageText = textContent.items
                        .map(item => item.str)
                        .join(' ');
                    
                    fullText += pageText + '\n';
                }
                
                // Update the PDF document with extracted text
                pdfDoc.extractedText = fullText;
                await pdfDoc.save();
            } catch (error) {
                console.error('Error extracting text:', error);
                return res.status(500).json({ 
                    error: 'Error extracting text from PDF', 
                    details: error.message 
                });
            }
        }

        // Translate the text
        try {
            const translation = await translate(textToTranslate, {
                to: targetLang
            });

            res.status(200).json({
                message: 'Text translated successfully',
                translatedText: translation.text
            });
        } catch (error) {
            console.error('Translation error:', error);
            return res.status(500).json({ 
                error: 'Error translating text', 
                details: error.message 
            });
        }

    } catch (error) {
        console.error('General error:', error);
        res.status(500).json({ 
            error: 'Error processing PDF translation', 
            details: error.message 
        });
    }
};

export const summarizeText = async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({ 
                error: 'Text is required for summarization' 
            });
        }

        // Split text into sentences
        const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0);
        
        // Calculate word frequency
        const wordFrequency = {};
        sentences.forEach(sentence => {
            const words = sentence.toLowerCase().split(/\s+/);
            words.forEach(word => {
                if (word.length > 3) { // Ignore short words
                    wordFrequency[word] = (wordFrequency[word] || 0) + 1;
                }
            });
        });

        // Calculate sentence scores based on word frequency
        const sentenceScores = sentences.map(sentence => {
            const words = sentence.toLowerCase().split(/\s+/);
            let score = 0;
            words.forEach(word => {
                if (wordFrequency[word]) {
                    score += wordFrequency[word];
                }
            });
            return { sentence, score };
        });

        // Sort sentences by score and take top 30%
        const summaryLength = Math.max(1, Math.floor(sentences.length * 0.3));
        const summary = sentenceScores
            .sort((a, b) => b.score - a.score)
            .slice(0, summaryLength)
            .map(item => item.sentence)
            .join('. ');

        res.status(200).json({
            message: 'Text summarized successfully',
            summary: summary + '.',
            originalLength: text.length,
            summaryLength: summary.length,
            reductionPercentage: ((text.length - summary.length) / text.length * 100).toFixed(2)
        });

    } catch (error) {
        console.error('Summarization error:', error);
        res.status(500).json({ 
            error: 'Error summarizing text', 
            details: error.message 
        });
    }
};
