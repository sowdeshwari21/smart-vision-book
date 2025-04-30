import express from 'express';
import { upload, uploadPDF, extractTextFromPDF, getAllPDFs, getPDFByName, updatePDF, deletePDF, translatePDF, summarizeText } from '../controller/pdfController.js';

const router = express.Router();

router.post('/upload', upload.single('pdf'), uploadPDF);
router.post('/extract/:pdfId', extractTextFromPDF);
router.get('/all', getAllPDFs);
router.get('/search/:name', getPDFByName);
router.put('/update/:pdfId', updatePDF);
router.delete('/delete/:pdfId', deletePDF);
router.post('/translate/:pdfId', translatePDF);
router.post('/summarize', summarizeText);
export default router;
