document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('resumes');
    const fileList = document.getElementById('file-list');
    const form = document.getElementById('screener-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const resultsContainer = document.getElementById('results-container');
    
    let uploadedFiles = [];

    // Expanded stop words list covering common English prepositions, pronouns, conjunctions, and auxiliaries
    const stopWords = new Set([
        "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", 
        "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", 
        "but", "by", "can", "cannot", "could", "couldn't", "did", "didn't", "do", "does", "doesn't", 
        "doing", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn't", 
        "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's", "her", "here", 
        "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", 
        "i'm", "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", 
        "me", "more", "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off", "on", 
        "once", "only", "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", 
        "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", 
        "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", 
        "there", "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", 
        "those", "through", "to", "too", "under", "until", "up", "very", "was", "wasn't", "we", 
        "we'd", "we'll", "we're", "we've", "were", "weren't", "what", "what's", "when", "when's", 
        "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's", "with", 
        "won't", "would", "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", 
        "yours", "yourself", "yourselves"
    ]);

    // Handle Drag & Drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
        fileInput.files = dt.files;
    });

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    function handleFiles(files) {
        fileList.innerHTML = '';
        uploadedFiles = Array.from(files).filter(f => 
            f.type === 'application/pdf' || 
            f.name.toLowerCase().endsWith('.pdf') || 
            f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
            f.name.toLowerCase().endsWith('.docx')
        );
        
        if (uploadedFiles.length > 0) {
            uploadedFiles.forEach(file => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.textContent = file.name;
                fileList.appendChild(fileItem);
            });
        } else {
            fileList.innerHTML = '<div class="error-message">Please select only PDF (.pdf) or Word (.docx) files.</div>';
        }
    }

    // Helper to yield control back to the UI thread
    const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const jobDesc = document.getElementById('job-description').value;
        
        if (!jobDesc.trim()) {
            showError('Please enter a job description.');
            return;
        }
        
        if (uploadedFiles.length === 0) {
            showError('Please upload at least one resume (PDF or Word).');
            return;
        }

        setLoading(true);

        try {
            const resumesData = [];
            
            for (let i = 0; i < uploadedFiles.length; i++) {
                const file = uploadedFiles[i];
                resultsContainer.innerHTML = `
                    <div class="empty-state">
                        <p>Parsing document ${i + 1} of ${uploadedFiles.length}: <strong>${file.name}</strong></p>
                    </div>
                `;
                await yieldToMain();
                
                const text = await extractTextFromFile(file);
                resumesData.push({ filename: file.name, text });
            }

            resultsContainer.innerHTML = '<div class="empty-state"><p>Vectorizing terms and computing candidate rankings...</p></div>';
            await yieldToMain();

            const validResumes = resumesData.filter(r => r.text && r.text.length > 0);
            if (validResumes.length === 0) {
                throw new Error("Could not extract any readable text from the provided files.");
            }

            const results = await rankResumesCustom(jobDesc, validResumes);
            renderResults(results);
            
        } catch (error) {
            console.error(error);
            showError(error.message);
        } finally {
            setLoading(false);
        }
    });

    // --- Document Parsers ---
    async function extractTextFromFile(file) {
        const fileName = file.name.toLowerCase();
        const arrayBuffer = await file.arrayBuffer();
        
        if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
            return await extractTextFromPDF(arrayBuffer, file.name);
        } else if (fileName.endsWith('.docx') || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            return await extractTextFromDocx(arrayBuffer, file.name);
        } else {
            throw new Error(`Unsupported file type: ${file.name}`);
        }
    }

    async function extractTextFromPDF(arrayBuffer, fileName) {
        try {
            const typedarray = new Uint8Array(arrayBuffer);
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + " ";
            }
            return fullText.trim();
        } catch(e) {
            console.error(`Failed to parse PDF ${fileName}:`, e);
            throw new Error(`Failed to parse PDF ${fileName}: ${e.message}`);
        }
    }

    async function extractTextFromDocx(arrayBuffer, fileName) {
        try {
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value.trim();
        } catch(e) {
            console.error(`Failed to parse Word document ${fileName}:`, e);
            throw new Error(`Failed to parse Word document ${fileName}: ${e.message}`);
        }
    }

    // --- Tokenizer with Skill Character Preservation & Bigram Support ---
    function tokenize(text) {
        const cleaned = text.toLowerCase()
            // Clean trailing/leading quotes, brackets, and structural delimiters while preserving #, +, ., /
            .replace(/[()\[\]{}"',;:!?]/g, ' ')
            .replace(/\s+/g, ' ');

        // Matches valid tokens including tech terms like c++, c#, .net, node.js, ci/cd, tcp/ip
        const tokenRegex = /(?:\.?[a-z0-9]+(?:[\.\+\#\/\-_][a-z0-9]+)*[\+\#]*)/g;
        const matches = cleaned.match(tokenRegex) || [];

        const unigrams = [];
        for (let token of matches) {
            // Trim leading/trailing isolated periods or hyphens
            token = token.replace(/^[\.\-_]+|[\.\-_]+$/g, '');
            if (token.length > 1 && !stopWords.has(token)) {
                unigrams.push(token);
            }
        }

        // Generate Bigrams (e.g., "software_engineer", "machine_learning")
        const ngrams = [...unigrams];
        for (let i = 0; i < unigrams.length - 1; i++) {
            ngrams.push(`${unigrams[i]}_${unigrams[i + 1]}`);
        }

        return ngrams;
    }

    // Sub-linear Term Frequency: reduces the impact of repeated keyword stuffing
    function calculateTF(tokens) {
        const rawCounts = {};
        for (const token of tokens) {
            rawCounts[token] = (rawCounts[token] || 0) + 1;
        }

        const tf = {};
        for (const term in rawCounts) {
            tf[term] = 1 + Math.log(rawCounts[term]);
        }
        return tf;
    }

    // --- Asynchronous Ranking Engine ---
    async function rankResumesCustom(jobDesc, resumes) {
        const docs = [jobDesc, ...resumes.map(r => r.text)];
        const docsTokens = docs.map(tokenize);
        
        await yieldToMain();

        // Calculate Document Frequency (DF)
        const df = {};
        for (const tokens of docsTokens) {
            const uniqueTokens = new Set(tokens);
            for (const token of uniqueTokens) {
                df[token] = (df[token] || 0) + 1;
            }
        }
        
        const N = docs.length;
        const idf = {};
        for (const token in df) {
            // Smooth IDF formula
            idf[token] = Math.log((1 + N) / (1 + df[token])) + 1;
        }

        const vocab = Object.keys(idf);
        
        // Compute L2-normalized TF-IDF vectors
        const vectors = docsTokens.map(tokens => {
            const tf = calculateTF(tokens);
            const vector = new Float64Array(vocab.length);
            let normSq = 0;
            
            for (let i = 0; i < vocab.length; i++) {
                const term = vocab[i];
                if (tf[term]) {
                    const weight = tf[term] * idf[term];
                    vector[i] = weight;
                    normSq += weight * weight;
                }
            }
            
            const norm = Math.sqrt(normSq);
            if (norm > 0) {
                for (let i = 0; i < vector.length; i++) {
                    vector[i] /= norm;
                }
            }
            return vector;
        });

        await yieldToMain();

        const jobVec = vectors[0];
        const results = [];
        
        for (let i = 1; i < vectors.length; i++) {
            let similarity = 0;
            const resVec = vectors[i];
            
            for (let j = 0; j < vocab.length; j++) {
                similarity += jobVec[j] * resVec[j];
            }
            
            results.push({
                filename: resumes[i - 1].filename,
                score: Math.round(similarity * 100)
            });
        }
        
        return results.sort((a, b) => b.score - a.score);
    }

    function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        btnText.textContent = isLoading ? 'Processing...' : 'Screen Candidates';
    }

    function renderResults(results) {
        resultsContainer.innerHTML = '';
        
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <p>No results could be processed.</p>
                </div>
            `;
            return;
        }
        
        results.forEach((result, index) => {
            const score = result.score;
            const rank = index + 1;
            let matchClass = 'match-low';
            let bgClass = 'bg-low';
            
            if (score >= 35) {
                matchClass = 'match-high';
                bgClass = 'bg-high';
            } else if (score >= 18) {
                matchClass = 'match-medium';
                bgClass = 'bg-medium';
            }
            
            const card = document.createElement('div');
            card.className = 'result-card';
            
            card.innerHTML = `
                <div class="card-header">
                    <div class="candidate-info">
                        <span class="rank-badge">#${rank}</span>
                        <span class="candidate-name" title="${result.filename}">${result.filename}</span>
                    </div>
                    <div class="match-badge ${matchClass}">${score}%</div>
                </div>
                <div class="score-bar-bg">
                    <div class="score-bar-fill ${bgClass}" style="width: ${score}%"></div>
                </div>
            `;
            
            resultsContainer.appendChild(card);
        });
    }

    function showError(message) {
        resultsContainer.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }
});
