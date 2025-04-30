const handleTranslation = async (pdfId, text, targetLang) => {
    try {
        setLoading(true);
        setError(null);

        if (!targetLang) {
            throw new Error('Please select a target language');
        }

        const response = await axios.post(`/pdf/translate/${pdfId}`, {
            text,
            targetLang
        });

        if (response.data.translatedText) {
            setTranslatedText(response.data.translatedText);
            setSourceLanguage(response.data.sourceLanguage);
            setShowTranslation(true);
        } else {
            throw new Error('No translation received');
        }
    } catch (error) {
        console.error('Translation error:', error);
        setError(error.response?.data?.error || error.message || 'Translation failed');
        setShowTranslation(false);
    } finally {
        setLoading(false);
    }
}; 