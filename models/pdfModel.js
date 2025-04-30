import mongoose from 'mongoose';

const pdfSchema = new mongoose.Schema({
    filename: String,
    originalName: String,
    size: Number,
    path: String,  // This will store the Cloudinary URL
    cloudinaryId: String,  // Store the Cloudinary public_id for future reference
    extractedText: String,
    uploadDate: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('PDF', pdfSchema);